import Highcharts, { type DashStyleValue } from 'highcharts/highstock'

import 'highcharts/modules/accessibility'

import './styles.css'

export const pad = (n: string | number, amount = 2) => {
    if (amount == 2) {
        return ('0' + n).slice(-2);
    } else {
        return ('00' + n).slice(-3);
    }
};


let gateway = `ws://${window.location.hostname}/ws`;
let ws: WebSocket;

const now = new Date()

let container: HTMLElement | null = document.querySelector('#plot')


let relais = 0
let relaisData = [
    [now.getTime(), 0]
]

let temp = 300;
let targetTemp = 300
let setOverShoot = 30
let setUnderShoot = 30
let targetTempOverShoot = 300
let targetTempUnderShoot = 300

let lastSwitch = new Date()
let lastSwitchDuration = 0
const oven = document.querySelector('#oven')
const temperature = document.querySelector('#temperature')
const relaisSwitch = document.querySelector('#relais_switch')
const relaisSwitchInput: HTMLInputElement | null = document.querySelector('#relais_switch_input')
const targetTempInput: HTMLInputElement | null = document.querySelector('#target_temperature')

let spoofInterval = 10
let speedFactor = 250 / spoofInterval
const switchDelay = 60 / speedFactor * 1000

let maxValues = 4 * 60 * 60 // 60 minutes (4 values/sec)

let hs: Highcharts.StockChart;
let hsOptions: Highcharts.Options

let temperatureData = [
    [now.getTime(), temp]
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

const dashStyle: DashStyleValue = 'Dash'
const getTargetLines = () => {
    return [
        { value: targetTemp, width: 3, dashStyle: dashStyle },
        { value: targetTempOverShoot, width: 1, dashStyle: dashStyle, color: "red" },
        { value: targetTempUnderShoot, width: 1, dashStyle: dashStyle, color: "red" }
    ]
}

const createChart = () => {
    hsOptions = {
        chart: {
            height: '650px',
            animation: {
                duration: 250,
                easing: 'linear'
            },
        },

        credits: {
            enabled: false
        },

        // title: {
        //     text: 'Temperature',
        //     align: 'left',
        // },

        rangeSelector: {
            enabled: false,
            inputDateFormat: '%H:%M:%S'
        },

        yAxis: {
            title: {
                text: '&deg;C'
            },
            opposite: false,
            min: 0,
            max: 600,
            tickInterval: 100,
            plotBands: [{
                from: 0,
                to: 250,
                color: 'rgba(69, 171, 255, 0.34)'
            }, {
                from: 250,
                to: 420,
                color: 'rgba(0, 255, 60, 0.34)'
            },
            {
                from: 420,
                to: 530,
                color: 'rgba(255, 162, 0, 0.4)'
            },
            {
                from: 530,
                to: 600,
                color: 'rgba(255, 0, 0, 0.4)'
            }],
            plotLines: getTargetLines()
        },

        xAxis: {
            type: 'datetime',
            tickInterval: 30 * 1000, // 30 seconds
            labels: {
                rotation: -45,
                formatter: (f) => {
                    let d = new Date(f.pos)
                    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
                },
                style: {
                    fontSize: '0.55em'
                }
            },
            plotBands: getRelaisBands(),

        },

        legend: {
            enabled: false,
        },

        tooltip: {
            formatter: function () {
                let d = new Date(this.x)
                return [pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()), `<b>${this.y?.toFixed(1)}&deg;C</b>`]
            }
        },

        plotOptions: {
            series: {
                animation: false,
                tooltip: {
                    valueDecimals: 2,
                },
            }
        },
        data: {
            enablePolling: true,
            dataRefreshRate: 0.5
        },

        series: [{
            type: 'areaspline',
            name: 'Temperature',
            data: temperatureData
        }],

        responsive: {
            rules: [{
                condition: {
                    maxWidth: 1000
                },
                chartOptions: {
                    legend: {
                        layout: 'horizontal',
                        align: 'center',
                        verticalAlign: 'bottom'
                    }
                }
            }]
        }
    }

    if (container && hsOptions)
        hs = Highcharts.stockChart(container, hsOptions)
}

const onLoad = () => {
    initWebSocket();


    if (container) {
        createChart()

        relaisSwitch?.addEventListener('click', switchRelais)
        targetTempInput?.addEventListener('change', changeTargetTemp)


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

                let shootFactor = Math.min(((((d.getTime() - lastSwitch.getTime()) / speedFactor) - ((lastSwitchDuration * 0.5) / speedFactor))) / ((3 * 60 * 1000) / speedFactor), 1) // 5mins
                shootFactor = shootFactor

                if (relais == 0) {
                    temp = temp - 0.8 * shootFactor
                } else {
                    temp = temp + 1 * shootFactor
                }

                let mod = temp % 0.25
                if (mod > 0.125) {
                    temp = temp - mod + 0.25
                } else {
                    temp = temp - mod
                }

                if (temperature)
                    temperature.innerHTML = temp.toFixed(2);

                temperatureData.push([d.getTime(), temp])

                let derivedShootFactor = Math.min(((d.getTime() - lastSwitch.getTime()) / speedFactor) / ((3 * 60 * 1000) / speedFactor), 1) // 5mins

                let overshoot = setOverShoot * derivedShootFactor; // derive over 5 mins -> 1 min eq. 3°C, 5mins eq. 15°C
                let dirivedOvershoot = Math.min(overshoot, setOverShoot);

                let undershoot = setUnderShoot * derivedShootFactor; // derive over 5 min -> 1 min eq. 3°C, 5mins eq. 15°C
                let dirivedUndershoot = Math.min(undershoot, setUnderShoot);

                targetTempOverShoot = targetTemp - dirivedOvershoot;
                targetTempUnderShoot = targetTemp + dirivedUndershoot;

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


                relaisData.push([d.getTime(), relais])

                hs.xAxis[0].update({ plotBands: getRelaisBands() })
                hs.yAxis[0].update({ plotLines: getTargetLines() })
                hs.series[0].setData(temperatureData, true)
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
        }

        hs.xAxis[0].update({ plotBands: getRelaisBands() })
        hs.yAxis[0].update({ plotLines: getTargetLines() })
        hs.series[0].setData(temperatureData, true)
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

