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
let temperatureData = [
    [now.getTime(), 25]
]

let relais = 0
let relaisData = [
    [now.getTime(), 0]
]

let temp = 25;
let targetTemp = 350

const oven = document.querySelector('#oven')
const temperature = document.querySelector('#temperature')
const relaisSwitch = document.querySelector('#relais_switch')
const relaisSwitchInput: HTMLInputElement | null = document.querySelector('#relais_switch_input')
const targetTempInput: HTMLInputElement | null = document.querySelector('#target_temperature')

let maxValues = 4 * 60 * 60 // 60 minutes (4 values/sec)

let hs: Highcharts.StockChart;
let hsOptions: Highcharts.Options

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
const getTargetLine = () => {
    return [
        { value: targetTemp, width: 3, dashStyle: dashStyle }
    ]
}

const createChart = () => {
    hsOptions = {
        chart: {
            animation: {
                duration: 250,
                easing: 'linear'
            },
        },

        credits: {
            enabled: false
        },

        title: {
            text: 'Temperature',
            align: 'left',
        },

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
            plotLines: getTargetLine()
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

                if (temp < 150) {
                    temp = temp + Math.random() * 4 - 1
                } else if (temp < 20) {
                    temp = temp + Math.random() * 4 - 1.3
                } else if (temp < targetTemp) {
                    temp = temp + Math.random() * 4 - 1.5
                } else if (temp >= targetTemp) {
                    temp = temp + Math.random() * 3 - 1.6
                }
                if (relais) {
                    temp = temp + 0.2
                } else {
                    temp = temp - 0.1
                }

                if (temperature)
                    temperature.innerHTML = temp.toFixed(2);
                temperatureData.push([d.getTime(), temp])
                relaisData.push([d.getTime(), relais])


                hs.xAxis[0].update({ plotBands: getRelaisBands() })
                hs.yAxis[0].update({ plotLines: getTargetLine() })
                hs.series[0].setData(temperatureData, true)
            }, 250)
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
        }

        hs.xAxis[0].update({ plotBands: getRelaisBands() })
        hs.yAxis[0].update({ plotLines: getTargetLine() })
        hs.series[0].setData(temperatureData, true)
    }
}

const switchRelais = () => {
    console.log('Send switch relais')
    if (!import.meta.env.DEV) {
        ws.send("switchRelais");
    } else {
        // spoof some test data
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
    targetTemp = value
    console.log('Changed target temp to ' + targetTemp)
    if (!import.meta.env.DEV) {
        ws.send("setTargetTemp: " + pad(targetTemp, 3));
    }
}

