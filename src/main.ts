
import * as d3 from "d3";


import './styles.css'


let gateway = `ws://${window.location.hostname}/ws`;
let ws: WebSocket;

const now = new Date()

let container: HTMLElement | null = document.querySelector('#plot')

let mode = 'off'
let temp = 300;
let relais = 0
let targetTemp = 300
let setOverShoot = 20
let setUnderShoot = 20
let targetTempOverShoot = targetTemp
let targetTempUnderShoot = targetTemp

let lastSwitch = new Date()
let lastSwitchDuration = 0

const oven = document.querySelector('#oven')
const temperature = document.querySelector('#temperature')
const relaisSwitch = document.querySelector('#relais_switch')
const relaisSwitchInput: HTMLInputElement | null = document.querySelector('#relais_switch_input')
const targetTempInput: HTMLInputElement | null = document.querySelector('#target_temperature')
const modeSpan: HTMLInputElement | null = document.querySelector('#mode_span')
const modeSelector: HTMLInputElement | null = document.querySelector('#mode_selector')
const prepareDownload: HTMLElement | null = document.querySelector('#prepare_download')
const downloadCSVButton: HTMLElement | null = document.querySelector('#download_csv')

let spoofInterval = 250
let speedFactor = 250 / spoofInterval
const switchDelay = (100 / speedFactor) * 1000

let maxValues = 4 * 60 * 60 // 60 minutes (4 values/sec)


let temperatureData = [
    [now.getTime(), temp]
]
let relaisData = [
    [now.getTime(), 0]
]

const getRelaisBands = () => {
    let relaisBands = []
    let active = false;

    for (let r of relaisData) {
        if (r[1] === 1 && !active) {
            active = true
            relaisBands.push({
                from: r[0],
                to: relaisData[relaisData.length - 1][0] + 1000,
                color: 'rgba(255, 0, 0, 0.25)'

            })
        }
        if (r[1] === 0 && active) {
            relaisBands[relaisBands.length - 1]['to'] = r[0]
            active = false
        }
    }
    return relaisBands
}


// set the dimensions and margins of the graph
const margin = { top: 10, right: 30, bottom: 30, left: 60 };
const width = 900 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;
let svg: d3.Selection<SVGGElement, unknown, null, undefined>;

const createChart = () => {

    // append the svg object to the body of the page
    svg = d3.select(container)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    // Declare the x (horizontal position) scale.
    const x = d3.scaleUtc(d3.extent(aapl, d => d.date), [margin.left, width - margin.right]);

    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear([0, d3.max(aapl, d => d.close)], [height - margin.bottom, margin.top]);

    // Declare the line generator.
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.close));

    // Add the x-axis.
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

    // Add the y-axis, remove the domain line, add grid lines and a label.
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(height / 40))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line").clone()
            .attr("x2", width - margin.left - margin.right)
            .attr("stroke-opacity", 0.1))
        .call(g => g.append("text")
            .attr("x", -margin.left)
            .attr("y", 10)
            .attr("fill", "currentColor")
            .attr("text-anchor", "start")
            .text("↑ Daily close ($)"));

    // Append a path for the line.
    svg.append("path")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 1.5)
        .attr("d", line(aapl));
}

const onLoad = () => {
    initWebSocket();


    if (container) {
        createChart()

        relaisSwitch?.addEventListener('click', switchRelais)
        modeSelector?.addEventListener('change', changeMode)
        targetTempInput?.addEventListener('change', changeTargetTemp)
        prepareDownload?.addEventListener('click', downloadCSV)


        if (import.meta.env.DEV) {
            // spoof some test data
            setInterval(() => {
                if (temperatureData.length > maxValues) {
                    temperatureData.shift()
                    relaisData.shift()
                }
                let d = new Date()

                if (temp < (targetTemp / 2)) {
                    temp = temp + Math.random() * 0.5 - 0.125
                } else if (temp < (targetTemp / (3 / 2))) {
                    temp = temp + Math.random() * 0.5 - 0.15
                } else {
                    temp = temp + Math.random() * 0.5 - 0.25
                }

                let shootFactor = Math.min(((((d.getTime() - lastSwitch.getTime()) / speedFactor) - ((lastSwitchDuration * 0.5) / speedFactor))) / ((5 * 60 * 1000) / speedFactor), 1) // 5mins
                shootFactor = shootFactor

                if (relais == 0) {
                    temp = temp - 0.3 * shootFactor
                } else {
                    temp = temp + 0.3 * shootFactor
                }

                let mod = temp % 0.25
                if (mod > 0.125) {
                    temp = temp - mod + 0.25
                } else {
                    temp = temp - mod
                }

                if (temperature)
                    temperature.innerHTML = temp.toFixed(2);


                let derivedShootFactor = Math.min(((d.getTime() - lastSwitch.getTime()) / speedFactor) / ((3 * 60 * 1000) / speedFactor), 1) // 5mins

                let overshoot = setOverShoot * derivedShootFactor; // derive over 5 mins -> 1 min eq. 3°C, 5mins eq. 15°C
                let dirivedOvershoot = Math.min(overshoot, setOverShoot);

                let undershoot = setUnderShoot * derivedShootFactor; // derive over 5 min -> 1 min eq. 3°C, 5mins eq. 15°C
                let dirivedUndershoot = Math.min(undershoot, setUnderShoot);

                targetTempOverShoot = targetTemp - dirivedOvershoot;
                targetTempUnderShoot = targetTemp + dirivedUndershoot;

                if (mode === 'auto_switch') {
                    if ((d.getTime() - lastSwitch.getTime()) > switchDelay) {
                        if (temp > targetTempOverShoot) // > 270 °C
                        {
                            if (relais == 1) {
                                relais = 0;
                                oven?.classList.remove('on')
                                relaisSwitch?.classList.remove('on')
                                if (relaisSwitchInput)
                                    relaisSwitchInput.checked = false

                                targetTempOverShoot = targetTemp
                                targetTempUnderShoot = targetTemp
                                lastSwitchDuration = d.getTime() - lastSwitch.getTime()
                                lastSwitch = new Date()
                            }
                        }
                    }
                    if ((d.getTime() - lastSwitch.getTime()) > switchDelay) {
                        if (temp < targetTempUnderShoot) // < 310°C
                        {
                            if (relais == 0) {
                                relais = 1;
                                oven?.classList.add('on')
                                relaisSwitch?.classList.add('on')
                                if (relaisSwitchInput)
                                    relaisSwitchInput.checked = true

                                targetTempOverShoot = targetTemp
                                targetTempUnderShoot = targetTemp
                                lastSwitchDuration = d.getTime() - lastSwitch.getTime()
                                lastSwitch = new Date()
                            }
                        }
                    }
                }

                temperatureData.push([d.getTime(), temp])
                relaisData.push([d.getTime(), relais])

                //update chart
            }, spoofInterval)
        }
    }
}




window.addEventListener('load', onLoad);

const getReadings = () => {
    ws.send("getReadings");
}

const initWebSocket = () => {
    if (!import.meta.env.DEV) {
        console.log('Trying to open a WebSocket connection…');
        ws = new WebSocket(gateway);
        ws.onopen = onOpen;
        ws.onclose = onClose;
        ws.onmessage = onMessage;
    }
}

// When websocket is established, call the getReadings() function
const onOpen = () => {
    console.log('Connection opened');
    getReadings();
}

const onClose = () => {
    console.log('Connection closed');
    setTimeout(initWebSocket, 2000);
}

// Function that receives the message from the ESP32 with the readings
const onMessage = (event: MessageEvent) => {
    let myObj = JSON.parse(event.data);
    let keys = Object.keys(myObj);

    for (var i = 0; i < keys.length; i++) {
        let key = keys[i];
        let element = document.getElementById(key)
        if (element) {
            element.innerHTML = myObj[key].toFixed(2);
        }
        let d = new Date()
        if (key === 'temperature') {
            if (temperatureData.length > maxValues) {
                temperatureData.shift()
            }
            temperatureData.push([d.getTime(), myObj[key]])

        } else if (key === 'relais') {
            if (relaisData.length > maxValues) {
                relaisData.shift()
            }
            relaisData.push([d.getTime(), myObj[key]])
            if (myObj[key]) {
                oven?.classList.add('on')
                relaisSwitch?.classList.add('on')
                if (relaisSwitchInput)
                    relaisSwitchInput.checked = true
            } else {
                oven?.classList.remove('on')
                relaisSwitch?.classList.remove('on')
                if (relaisSwitchInput)
                    relaisSwitchInput.checked = false
            }
        } else if (key === 'target_temp') {
            targetTemp = myObj[key]
        } else if (key === 'derived_overshoot') {
            targetTempOverShoot = myObj[key]
        } else if (key === 'derived_undershoot') {
            targetTempUnderShoot = myObj[key]
        } else if (key === 'mode') {
            mode = myObj[key]
            if (modeSpan) {
                modeSpan.innerText = mode;
            }
        }


    }
}

const switchRelais = () => {
    console.log('Send switch relais')
    if (!import.meta.env.DEV) {
        ws.send("switchRelais");
    } else {
        // spoof some test data
        let d = new Date()
        lastSwitchDuration = d.getTime() - lastSwitch.getTime()
        lastSwitch = new Date()
        if (!relais) {
            relais = 1
            oven?.classList.add('on')
            relaisSwitch?.classList.add('on')
            if (relaisSwitchInput)
                relaisSwitchInput.checked = true
        } else {
            relais = 0
            oven?.classList.remove('on')
            relaisSwitch?.classList.remove('on')
            if (relaisSwitchInput)
                relaisSwitchInput.checked = false
        }
    }
}

const changeTargetTemp = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    let value = Number(target?.value)
    console.log('Changed target temp to ' + value)
    if (!import.meta.env.DEV) {
        ws.send("setTargetTemp: " + pad(value, 3));
    } else {
        targetTemp = value
        targetTempOverShoot = value
        targetTempUnderShoot = value
    }
}

const changeMode = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    let value = target?.value
    console.log('Mode set to ' + value)
    if (!import.meta.env.DEV) {
        ws.send("setMode: " + value);
    } else {
        mode = value
        if (modeSpan) {
            modeSpan.innerText = mode + " ";
        }
    }
}

const downloadCSV = () => {
    let csvContent = 'Time,Temp,Relais\n'

    console.log(temperatureData.length, relaisData.length)

    for (let [i, temp] of temperatureData.entries()) {

        csvContent += `${temp[0]},${temp[1]},${relaisData[i] ? relaisData[i][1] : ''}\n`
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8,' })
    const objUrl = URL.createObjectURL(blob)
    if (downloadCSVButton) {
        downloadCSVButton.classList.remove('hidden')
        downloadCSVButton.setAttribute('href', objUrl)
        downloadCSVButton.setAttribute('download', 'data.csv')
    }
}
