//- 功能 : 前端 JavaScript 文件，负责与 `vis.html` 交互，实现数据可视化。
//- 工作流程 :
//1. 通过 fetch API 加载 `viz_data.json` 。
//2. 使用 ECharts 库初始化各种图表（价格、相关性、预测对比、资金曲线、季节性、误差分布、交易信号、月度收益热力图、指标雷达图、置信区间、情绪热力图等）。
//3. 将从 JSON 文件解析的数据配置到 ECharts 图表中并渲染。
//4. 包含一些交互逻辑，例如模型选择器 ( `initSelector` in `initSignalChart` )。




// 加载数据
fetch('viz_data.json')
    .then(response => response.json())
    .then(data => {
        initPriceChart(data.price_data);
        initCorrChart(data.corr_matrix);
        initForecastChart(data.model_data);
        initEquityChart(data.backtest_data);
        initSeasonalChart(data.seasonal_data);
        initErrorChart(data.model_data);
        initSignalChart(data.price_data, data.backtest_data);
        initMonthlyHeatmap(data.backtest_data);
        initRadarChart(data.metrics);
        initdrawConfidenceChart(data.conf_ints)
        initSentimentHeatmap(data.sentiments)
    });

// 价格时间序列图
function initPriceChart(priceData) {
    const chart = echarts.init(document.getElementById('priceChart'));
    const option = {
        title: {text: '铝期货价格走势'},
        tooltip: {trigger: 'axis'},
        xAxis: {data: priceData.dates},
        yAxis: {type: 'value'},
        series: [{
            name: '收盘价',
            type: 'line',
            smooth: true,
            data: priceData.prices,
            areaStyle: {color: 'rgba(64,158,255,0.1)'}
        }]
    };
    chart.setOption(option);
}

// 相关性热力图
function initCorrChart(corrData) {
    const chart = echarts.init(document.getElementById('corrChart'));
    const option = {
        title: {text: '特征相关性矩阵'},
        tooltip: {position: 'top'},
        grid: {height: '70%'},
        xAxis: {data: corrData.features},
        yAxis: {data: corrData.features},
        visualMap: {min: -1, max: 1},
        series: [{
            type: 'heatmap',
            data: corrData.matrix.flatMap((row, i) =>
                row.map((value, j) => [i, j, value])
            ),
            itemStyle: {borderWidth: 1}
        }]
    };
    chart.setOption(option);
}

// 模型预测对比
function initForecastChart(modelData) {
    const chart = echarts.init(document.getElementById('forecastChart'));
    
    // 检查 modelData 是否有效
    if (!modelData || Object.keys(modelData).length === 0) {
        console.error("模型预测对比图：无可用模型数据。");
        chart.setOption({ title: { text: '模型预测对比', subtext: '无可用数据' } });
        return;
    }
    const firstModelName = Object.keys(modelData)[0];

    // 解析真实值数据
    let trueDataRaw = modelData[firstModelName]['true'];
    let trueData = [];
    if (typeof trueDataRaw === 'string') {
        try {
            trueData = JSON.parse(trueDataRaw);
        } catch (e) {
            console.error("模型预测对比图：解析真实值数据JSON失败:", e);
            trueData = []; // 出错时回退到空数组
        }
    } else if (Array.isArray(trueDataRaw)) {
        trueData = trueDataRaw;
    }
    if (!Array.isArray(trueData)) trueData = []; // 再次确保 trueData 是数组

    // 提取日期和真实收盘价，并收集用于Y轴缩放的值
    const dates = trueData.map(item => (item && item.date ? item.date.slice(0, 10) : 'N/A'));
    const trueCloseValues = trueData
        .map(item => (item && typeof item.close !== 'undefined' ? parseFloat(item.close) : NaN))
        .filter(v => !isNaN(v));

    let allValues = []; // 用于计算Y轴范围的所有数据点
    if (trueCloseValues.length > 0) {
        allValues.push(...trueCloseValues);
    }

    const series = [];

    // 添加真实值系列
    const trueSeries = {
        name: '真实值',
        type: 'line',
        data: trueCloseValues,
        smooth: true,
        lineStyle: {
            type: 'dashed',
            width: 3,       // 真实值线条加粗
            color: '#000000' // 明确指定为黑色
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
            color: '#000000' // 明确指定为黑色
        },
        z: 99 // 确保真实值在最顶层
    };
    series.push(trueSeries);

    // 添加每个模型的预测曲线
    for (const [model, dataObj] of Object.entries(modelData)) {
        let predDataRaw = dataObj.pred;
        let parsedPredData = [];

        if (typeof predDataRaw === 'string') {
            try {
                parsedPredData = JSON.parse(predDataRaw);
            } catch (e) {
                console.error(`模型预测对比图：解析模型 ${model} 的预测数据JSON失败:`, e);
                parsedPredData = [];
            }
        } else if (Array.isArray(predDataRaw)) {
            parsedPredData = predDataRaw;
        }
        if (!Array.isArray(parsedPredData)) parsedPredData = [];

        // 将预测数据转换为数字，并进行清洗
        const predDataNumbers = parsedPredData
            .map(val => {
                let numVal = NaN;
                if (typeof val === 'object' && val !== null && typeof val.value !== 'undefined') {
                    numVal = parseFloat(val.value);
                } else if (typeof val === 'number' || typeof val === 'string') {
                    numVal = parseFloat(val);
                }
                return isNaN(numVal) ? NaN : parseFloat(numVal.toFixed(2));
            })
            .filter(v => !isNaN(v));

        if (predDataNumbers.length > 0) {
            allValues.push(...predDataNumbers);
        }

        // 为特定模型设置线条样式
        let modelLineStyle = { width: 2 }; // 模型预测线默认宽度
        if (model.toUpperCase() === 'ARIMA') {
            modelLineStyle.color = '#007bff'; // 为ARIMA设置鲜艳的蓝色
        } else if (model.toUpperCase() === 'LSTM') {
            modelLineStyle.color = '#28a745'; // 为LSTM设置鲜艳的绿色
        }
        // 其他模型将使用ECharts的默认颜色，但线条宽度为2

        series.push({
            name: `${model}预测`,
            type: 'line',
            data: predDataNumbers,
            smooth: true,
            lineStyle: modelLineStyle
        });
    }

    // 配置Y轴的动态范围
    let yAxisConfig = { 
        type: 'value',
        scale: true // 允许在设置min/max时依然保持良好的刻度分布
    };

    if (allValues.length > 0) {
        const finiteValues = allValues.filter(v => isFinite(v)); // 确保只使用有效数值
        if (finiteValues.length > 0) {
            const dataMin = Math.min(...finiteValues);
            const dataMax = Math.max(...finiteValues);
            const range = dataMax - dataMin;
            
            // 计算边距，如果数据范围为0（例如所有值相同），则使用基于值的百分比或固定值作为边距
            const padding = range === 0 ? (Math.abs(dataMax * 0.05) || 10) : range * 0.05; 
            
            yAxisConfig.min = parseFloat((dataMin - padding).toFixed(2));
            yAxisConfig.max = parseFloat((dataMax + padding).toFixed(2));
        }
    }
    
    const option = {
        title: {text: '模型预测对比'},
        tooltip: {trigger: 'axis'},
        xAxis: {
            type: 'category',
            data: dates,
            axisLabel: {
                formatter: value => value // X轴标签格式化
            }
        },
        yAxis: yAxisConfig, // 应用动态计算的Y轴配置
        legend: {data: series.map(s => s.name)}, // 根据系列名称生成图例
        series: series
    };
    chart.setOption(option);
}

// 资金与回撤曲线
function initEquityChart(backtestData) {
    const chart = echarts.init(document.getElementById('equityChart'));
    // 解析所有模型的 JSON 数据
    Object.keys(backtestData).forEach(model => {
        backtestData[model] = JSON.parse(backtestData[model]);
    });

    // console.log(backtestData);

    // 提取日期（假设所有模型日期一致，选择第一个模型的日期作为 X 轴）
    const dates = backtestData[Object.keys(backtestData)[0]].map(item => item.date ? item.date.slice(0, 10) : '');  // 提取日期

    // 初始化各模型的系列数据
    const series = [];
    const legendData = [];
    const yAxisData = [
        {type: 'value', name: '净值'},
        {type: 'value', name: '回撤'}
    ];

    // 遍历所有模型的数据
    Object.keys(backtestData).forEach(model => {
        const strategyNet = backtestData[model].map(item => item.strategy_net || 0);  // 默认值为 0
        const maxDrawdown = backtestData[model].map(item => item.max_drawdown || 0);  // 默认值为 0

        // 添加净值的系列数据
        series.push({
            name: `${model} 净值`,
            type: 'line',
            data: strategyNet,
            smooth: true
        });

        // 添加回撤的系列数据
        series.push({
            name: `${model} 回撤`,
            type: 'line',
            yAxisIndex: 1,
            data: maxDrawdown,
            areaStyle: {color: `rgba(${getRandomColor()}, 0.1)`}  // 随机颜色
        });

        // 添加图例数据
        legendData.push(`${model} 净值`, `${model} 回撤`);
    });

    // 图表配置
    const option = {
        title: {
            text: '资金与回撤曲线图'
        },
        tooltip: {
            trigger: 'axis'
        },
        legend: {
            data: legendData
        },
        xAxis: {
            type: 'category',
            data: dates // 使用日期作为 X 轴
        },
        yAxis: yAxisData,
        series: series
    };


    chart.setOption(option)

    // 随机生成颜色
    function getRandomColor() {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return `${r}, ${g}, ${b}`;
    }
}

//  季节性分解图
function initSeasonalChart(seasonalData) {
    // console.log(seasonalData)
    Object.keys(seasonalData).forEach(key => {
        seasonalData[key] = JSON.parse(seasonalData[key]);
    });
    // console.log(seasonalData['trend'][0])
    const trendDates = seasonalData.trend.map(item => item.date.slice(0, 10));
    const trendValues = seasonalData.trend.map(item => item.trend || 0);
    const seasonalValues = seasonalData.seasonal.map(item => item.seasonal || 0);
    const residualValues = seasonalData.residual.map(item => item.residual || 0);
    const chart = echarts.init(document.getElementById('seasonalChart'));
    const option = {
        title: {
            text: '季节性分解'
        },
        tooltip: {
            trigger: 'axis'
        },
        legend: {
            data: ['趋势', '季节性', '残差']
        },
        grid: [
            {
                top: '10%',
                height: '22%'
            },
            {
                top: '40%',
                height: '22%'
            },
            {
                top: '70%',
                height: '22%'
            }
        ],
        xAxis: [
            {type: 'category', data: trendDates, gridIndex: 0},
            {type: 'category', data: trendDates, gridIndex: 1},
            {type: 'category', data: trendDates, gridIndex: 2}
        ],
        yAxis: [
            {type: 'value', name: '趋势', gridIndex: 0},
            {type: 'value', name: '季节性', gridIndex: 1},
            {type: 'value', name: '残差', gridIndex: 2}
        ],
        series: [
            {
                name: '趋势',
                type: 'line',
                data: trendValues,
                smooth: true,
                xAxisIndex: 0,
                yAxisIndex: 0
            },
            {
                name: '季节性',
                type: 'line',
                data: seasonalValues,
                smooth: true,
                xAxisIndex: 1,
                yAxisIndex: 1
            },
            {
                name: '残差',
                type: 'scatter',
                data: residualValues,
                xAxisIndex: 2,
                yAxisIndex: 2
            }
        ]
    };
    chart.setOption(option);
}

//  预测误差箱线图
function initErrorChart(modelData) {
    const chart = echarts.init(document.getElementById('errorChart'));
    const seriesData = [];
    const xAxisData = [];

    Object.keys(modelData).forEach(model => {
        // 解析 JSON 字符串
        const errorArray = JSON.parse(modelData[model].errors).map(item => item.close);

        if (errorArray.length === 0) return;

        // 排序
        const sorted = errorArray.slice().sort((a, b) => a - b);

        // 计算 boxplot 所需的 5 个数值
        const min = sorted[0];
        const q1 = percentile(sorted, 25);
        const median = percentile(sorted, 50);
        const q3 = percentile(sorted, 75);
        const max = sorted[sorted.length - 1];

        seriesData.push([min, q1, median, q3, max]);
        xAxisData.push(model);
    });

// 计算百分位
    function percentile(arr, p) {
        const index = (p / 100) * (arr.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return arr[lower];
        return arr[lower] + (arr[upper] - arr[lower]) * (index - lower);
    }

    const option = {
        title: {text: '模型预测误差分布'},
        tooltip: {
            trigger: 'item',
            formatter: (params) => {
                const [min, q1, median, q3, max] = params.data;
                return `
                模型: ${params.name}<br/>
                最小值: ${min.toFixed(2)}<br/>
                Q1: ${q1.toFixed(2)}<br/>
                中位数: ${median.toFixed(2)}<br/>
                Q3: ${q3.toFixed(2)}<br/>
                最大值: ${max.toFixed(2)}
            `;
            }
        },
        xAxis: {
            type: 'category',
            data: xAxisData,
            name: '模型'
        },
        yAxis: {
            type: 'value',
            name: '误差'
        },
        series: [{
            name: '预测误差',
            type: 'boxplot',
            data: seriesData
        }]
    };


    chart.setOption(option);
}

//  交易信号标记图
function initSignalChart(priceData, backtestData) {
    const chart = echarts.init(document.getElementById('signalChart'));

    let currentModel = Object.keys(backtestData)[0]; // 默认显示第一个模型

    // 生成图表配置
    function generateOption(model) {
        const modelData = backtestData[model];
        const dates = modelData.map(d => d.date.slice(0, 10));
        const closePrices = modelData.map(d => d.close);
        const predictions = modelData.map(d => d.pred);

        // 生成买卖信号数据
        const buySignals = modelData.map((d, i) =>
            d.signal > 0 ? {
                name: '买入',
                coord: [dates[i], closePrices[i]],
                value: `预测价：${predictions[i].toFixed(2)}`
            } : null
        ).filter(Boolean);

        const sellSignals = modelData.map((d, i) =>
            d.signal < 0 ? {
                name: '卖出',
                coord: [dates[i], closePrices[i]],
                value: `预测价：${predictions[i].toFixed(2)}`
            } : null
        ).filter(Boolean);

        return {
            title: {
                text: `${model} 交易信号分析`,
                subtext: '绿色↑：买入信号 | 红色↓：卖出信号'
            },
            tooltip: {
                trigger: 'axis',
                formatter: params => {
                    const signal = params[1].componentSubType === 'scatter'
                        ? `信号类型：${params[1].seriesName}<br/>${params[1].value[1]}`
                        : `日期：${params[0].name}<br/>收盘价：${params[0].value !== undefined ? params[0].value.toFixed(2) : '数据无效'}`;

                    return signal;
                }
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLabel: {rotate: 45}
            },
            yAxis: {type: 'value'},
            series: [
                {
                    name: '真实价格',
                    type: 'line',
                    data: closePrices,
                    smooth: true,
                    lineStyle: {color: '#5470C6'},
                    markPoint: {
                        symbol: 'triangle',
                        symbolSize: 3, // 调整买入卖出标记的大小
                        data: buySignals,
                        itemStyle: {
                            color: '#91CC75',
                            borderColor: '#5470C6'
                        },
                        label: {
                            color: '#fff',
                            backgroundColor: '#91CC75',
                            padding: [3, 5],
                            formatter: ''
                        }
                    }
                },
                // 仅显示买入卖出信号
                {
                    name: '买入信号',
                    type: 'scatter',
                    data: buySignals.map(d => d.coord),
                    symbol: 'triangle',
                    symbolSize: 10, // 调整买入标记的大小
                    itemStyle: {color: '#91CC75'}
                },
                {
                    name: '卖出信号',
                    type: 'scatter',
                    data: sellSignals.map(d => d.coord),
                    symbol: 'triangle',
                    symbolSize: 10, // 调整卖出标记的大小
                    itemStyle: {color: '#EE6666'}
                }
            ],
            dataZoom: [{
                type: 'inside',
                start: 0,
                end: 100
            }]
        };
    }

    // 初始化模型选择器
    function initSelector() {
        const selector = document.getElementById('modelSelector');
        Object.keys(backtestData).forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            selector.appendChild(option);
        });

        selector.addEventListener('change', () => {
            currentModel = selector.value;
            chart.setOption(generateOption(currentModel));
        });
    }

    // 初始化
    initSelector();
    chart.setOption(generateOption(currentModel));

    // 窗口大小变化时自适应
    window.addEventListener('resize', () => chart.resize());
}


//  月度收益热力图
function initMonthlyHeatmap(backtestData) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    Object.keys(backtestData).forEach(modelKey => {
        const modelData = backtestData[modelKey];
        const monthlyReturns = {};

        // 汇总月度策略收益
        modelData.forEach(row => {
            const date = new Date(row.date);
            const year = date.getFullYear();
            const month = date.getMonth(); // 0-11
            const key = `${year}-${month}`;

            if (!monthlyReturns[key]) {
                monthlyReturns[key] = {
                    year,
                    month,
                    totalReturn: 0,
                    count: 0
                };
            }

            monthlyReturns[key].totalReturn += parseFloat(row.strategy_return || 0);
            monthlyReturns[key].count++;
        });

        // 转换为 ECharts 所需格式
        const data = Object.values(monthlyReturns).map(d => [
            String(d.year),
            d.month,
            +(d.totalReturn / d.count).toFixed(4)
        ]);

        const years = [...new Set(data.map(d => d[0]))].sort();
        const values = data.map(d => d[2]);
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 1;

        // ECharts 配置项
        const option = {
            title: {text: `${modelKey} 月度收益热力图`, left: 'center'},
            tooltip: {
                formatter: params =>
                    `${params.data[0]} ${monthNames[params.data[1]]}：${(params.data[2] * 100).toFixed(2)}%`
            },
            visualMap: {
                min,
                max,
                show:false,
                inRange: {color: ['#ffffff', '#ff6666']},
                orient: 'horizontal',
                left: 'right',
                top: 'top',
                bottom: '10%'
            },
            xAxis: {
                type: 'category',
                data: years,
                axisLabel: {rotate: 45, interval: 0}
            },
            yAxis: {
                type: 'category',
                data: monthNames,
                inverse: true
            },
            series: [{
                type: 'heatmap',
                data: data.map(d => [d[0], d[1], d[2]]),
                itemStyle: {borderWidth: 1},
                label: {show: false}
            }]
        };

        // 渲染图表
        const chartDom = document.getElementById(`monthlyHeatmap_${modelKey}`);
        if (chartDom) {
            echarts.init(chartDom).setOption(option);
        } else {
            console.warn(`找不到ID为 monthlyHeatmap_${modelKey} 的容器`);
        }
    });

}

//  绩效指标雷达图
function initRadarChart(metrics) {
    chart = echarts.init(document.getElementById('radarChart'));
    const indicators = [
        {name: '年化收益率', max: 0.5},  // 最大值设置为0.5，可以根据实际情况调整
        {name: '夏普比率', max: 3},      // 夏普比率最大值设为3
        {name: '最大回撤', max: 0.3},    // 最大回撤最大值设为0.3
        {name: '胜率', max: 1},          // 胜率最大值为1
        {name: '盈亏比', max: 3}         // 盈亏比最大值为3
    ];

    // 根据metrics生成数据
    const seriesData = Object.keys(metrics).map(model => ({
        name: model,
        value: [
            parseFloat(metrics[model]['\u5e74\u5316\u6536\u76ca\u7387']),  // 年化收益率
            parseFloat(metrics[model]['\u590f\u666e\u6bd4\u7387']),  // 夏普比率
            parseFloat(metrics[model]['\u6700\u5927\u56de\u64a4']),  // 最大回撤
            parseFloat(metrics[model]['\u80dc\u7387']),  // 胜率
            parseFloat(metrics[model]['Profit Factor'])  // 盈亏比
        ]
    }));

    // 配置雷达图选项
    const option = {
        title: {
            text: '模型绩效雷达图',
            left: 'center'
        },
        tooltip: {
            show: false,
            triggerOn: 'mousemove',
            formatter: function () {
                return '';
            }
        },
        legend: {
            data: Object.keys(metrics),  // 将所有模型名称作为图例
            orient: 'horizontal',
            left: 'center',
            top: 'bottom'
        },
        toolbox: {
            feature: {
                saveAsImage: {}  // 保存为图片功能
            },
            orient: 'horizontal',
            left: 'right',
            top: 'top'
        },
        radar: {
            indicator: indicators
        },
        series: [{
            type: 'radar',
            data: seriesData
        }]
    };
    chart.on('mousemove', (params) => {
        let num = params.event.topTarget.__dimIdx;
        if (num === undefined) {
            option.tooltip.show = false;
            option.tooltip.formatter = function () {
                return '';
            };
        } else {
            option.tooltip.show = true;
            option.tooltip.formatter = function (params) {
                return (
                    option.radar.indicator[num].name +
                    ':' +
                    params.data.value[num].toFixed(2)
                );
            };
        }
        chart.setOption(option);
    });
    chart.setOption(option);
}

function initdrawConfidenceChart(confInts) {
    confInts = JSON.parse(confInts)
    // 数据预处理
    const processedData = confInts.map(item => ({
        date: item.date,
        lower: item['lower close'],
        upper: item['upper close'],
        delta: item['upper close'] - item['lower close']
    }));

    // 生成ECharts需要的数据格式
    const baseSeries = processedData.map(d => [d.date, d.lower]);
    const deltaSeries = processedData.map(d => ({
        value: [d.date, d.delta],
        lower: d.lower,
        upper: d.upper
    }));

    // 配置图表选项
    const option = {
        title: {
            text: '基于ARIMA预测置信区间',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            formatter: params => {
                const data = params[1].data;
                const date = new Date(data.value[0]);
                return `
                    ${date.toLocaleDateString()}<br/>
                    下界: ${data.lower.toFixed(2)}<br/>
                    上界: ${data.upper.toFixed(2)}<br/>
                    波动范围: ${(data.upper - data.lower).toFixed(2)}
                `;
            }
        },
        xAxis: {
            type: 'time',
            axisLabel: {
                formatter: '{yyyy}-{MM}-{dd}'
            },
            splitLine: {show: false}
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLabel: {
                formatter: value => value.toFixed(0)
            }
        },
        series: [
            {
                name: '基线',
                type: 'line',
                stack: 'confidence',
                data: baseSeries,
                lineStyle: {width: 0},
                areaStyle: {color: 'transparent'}
            },
            {
                name: '置信区间',
                type: 'line',
                stack: 'confidence',
                data: deltaSeries,
                lineStyle: {width: 0},
                areaStyle: {
                    color: '#FFB1C1',
                    opacity: 0.4
                },
                emphasis: {disabled: true}
            }
        ],
        grid: {
            containLabel: true,
            left: '5%',
            right: '5%'
        }
    };

    // 渲染图表
    echarts.init(document.getElementById('confidenceChart')).setOption(option);
}

//  情感热力图
function initSentimentHeatmap(sentimentData) {
    const models = Object.keys(sentimentData);
    const allDatesSet = new Set();

    const heatmapData = [];

    // 整理数据
    models.forEach((model, modelIdx) => {
        sentimentData[model].forEach(item => {
            const date = item.date;
            const direction = item.direction; // 1上涨，0下跌
            const confidence = item.confidence;
            const value = direction === 1 ? confidence : -confidence; // 跌为负，涨为正

            heatmapData.push([date, model, value.toFixed(4)]);
            allDatesSet.add(date);
        });
    });

    const allDates = Array.from(allDatesSet).sort(); // 所有日期作为 xAxis

    const option = {
        title: {
            text: '市场情绪趋势热力图',
            left: 'center'
        },
        tooltip: {
            formatter: function (params) {
                const sentiment = params.data[2];
                const type = sentiment >= 0 ? '上涨' : '下跌';
                return `${params.data[1]}<br>${params.data[0]}：<br>方向：${type}<br>情绪强度：${Math.abs(sentiment)}`;
            }
        },
        grid: {
            top: '10%',
            left: '10%',
            right: '10%',
            bottom: '15%'
        },
        xAxis: {
            type: 'category',
            data: allDates,
            splitArea: {show: true},
            axisLabel: {
                rotate: 45
            }
        },
        yAxis: {
            type: 'category',
            data: models,
            splitArea: {show: true}
        },
        visualMap: {
            min: -0.05,
            max: 0.05,
            calculable: true,
            orient: 'horizontal',
            left: 'right',
            top: 'top',
            inRange: {
                color: ['#66ccff', '#ffffff', '#ff6666'] // 跌→中→涨
            }
        },
        series: [{
            name: '情绪强度',
            type: 'heatmap',
            data: heatmapData,
            label: {
                show: false
            },
            itemStyle: {
                borderWidth: 1,
                borderColor: '#ccc'
            }
        }]
    };

    echarts.init(document.getElementById('sentimentHeatmap')).setOption(option);
}