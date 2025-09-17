import json

import numpy as np
import pandas as pd
import warnings

from statsmodels.tsa.seasonal import seasonal_decompose


from utils.utils import prepare_features, simplified_backtest, set_seed , compute_sentiment

warnings.filterwarnings("ignore", category=FutureWarning)

from models.ARIMAAndRF import rolling_arima
from models.LSTMModel import train_and_predict_lstm_model


from utils.aluminum_price_analysis import visualize_results

'''
- 功能 : 项目的主入口和协调器。
- 工作流程 :
1. 设置随机种子。
2. 加载 `data.csv` 。
3. 调用 `prepare_features` 进行特征工程和数据标准化。
4. 划分训练集和测试集。
5. 调用 `rolling_arima` 训练 ARIMA 模型并获取预测。
6. 调用 `train_and_predict_lstm_model` 训练 LSTM 模型并获取预测。
7. 整理模型预测结果。
8. 对每个模型的结果，调用 `simplified_backtest` 进行回测并获取统计指标。
9. 调用 `compute_sentiment` 计算情绪指标。
10. 调用 `save_viz_data` 将所有需要可视化的数据（价格、预测、回测、指标、相关性、季节性等）保存到 `viz_data.json` 。
11. 打印各模型的回测报告。
'''

def convert(obj):
    if isinstance(obj, pd.Series):
        return obj.reset_index().to_dict(orient='records')
    elif isinstance(obj, pd.DataFrame):
        return obj.reset_index().to_dict(orient='records')  # 如果你有DataFrame
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

def save_viz_data(data, results_dict, backtest_df, features, metrics, conf_ints, sentiments):
    # 价格时间序列
    price_data = {
        "dates": data.index.strftime('%Y-%m-%d').tolist(),
        "prices": data['close'].tolist()
    }

    # 价格分布
    hist_data = {
        "bins": np.histogram(data['close'], bins=30)[0].tolist(),
        "values": np.histogram(data['close'], bins=30)[1].tolist()
    }

    # 相关性矩阵
    corr_matrix = {
        "features": features,
        "matrix": data[features].corr().values.tolist()
    }

    # 季节性分解
    decomposition = seasonal_decompose(data['close'], period=30)
    seasonal_data = {
        "trend": decomposition.trend.dropna().reset_index().to_json(orient='records', date_format='iso'),
        "seasonal": decomposition.seasonal.dropna().reset_index().to_json(orient='records', date_format='iso'),
        "residual": decomposition.resid.dropna().reset_index().to_json(orient='records', date_format='iso')
    }

    # 模型预测数据
    model_data = {}
    for model in results_dict:
        model_data[model] = {
            "pred": results_dict[model]["pred"],
            "true": results_dict[model]["true"]['close'].reset_index().to_json(orient='records', date_format='iso'),
            "errors": (results_dict[model]["true"]['close'] - results_dict[model]["pred"]).reset_index().to_json(orient='records', date_format='iso')
        }
    # 保存所有数据
    viz_data = {
        "price_data": price_data,
        "hist_data": hist_data,
        "corr_matrix": corr_matrix,
        "seasonal_data": seasonal_data,
        "model_data": model_data,
        "backtest_data": backtest_df,
        "metrics": metrics,
        "conf_ints": conf_ints,
        "sentiments": sentiments
    }
    with open('viz_data.json', 'w') as f:
        json.dump(viz_data, f)

def main():
    # 数据加载与预处理
    set_seed(42)

    data = pd.read_csv('./data/data.csv', parse_dates=['date'], index_col='date')
    data.sort_index(inplace=True)
    # 生成标签
    # data['Label'] = (data['close'].shift(-1) > data['close']).astype(float)
    data = data.dropna()
    # 划分训练测试集
    train_size = int(len(data) * 0.8)
    # train_data, test_data = data.iloc[:train_size], data.ilo
    # c[train_size:]
    features = ['open', 'high', 'low', 'close', 'ma5', 'ma20', 'rsi', 'macd', 'bb_upper', 'bb_middle', 'bb_lower']
    window_size = 30
    raw_data, scaled_df, scaler = prepare_features(data)
    train_data, test_data = raw_data.iloc[:train_size], raw_data.iloc[train_size:]
    # ARIMA模型
    print("Training ARIMA...")
    arima_train = train_data['close']
    arima_test = test_data['close']
    exog_features = [f for f in features if f != 'close']
    exog_train = train_data[exog_features]
    exog_test = test_data[exog_features]
    arima_preds, conf_ints_df = rolling_arima(arima_train, arima_test, exog_train, exog_test,window_size=100)

    print("\nTraining LSTM...")
    batch_size = 64
    lstm_model, lstm_preds = train_and_predict_lstm_model(scaled_df[:train_size], scaled_df[train_size - window_size:],
                                              window_size=window_size,
                                              batch_size=batch_size,
                                              epochs=50,
                                              scaler=scaler)
    # 将模型预测结果存入字典中
    test_data = raw_data[train_size - window_size:]
    test_length = min(len(test_data),
                      len(arima_preds),
                      len(lstm_preds)
                      )
    results_dict = {
        "ARIMA": {"true": test_data[-test_length:], "pred": arima_preds[-test_length:]},
        "LSTM": {"true": test_data[-test_length:], "pred": lstm_preds[-test_length:]},
    }
    conf_ints_df = conf_ints_df[-test_length:]
    conf_ints_df.index =test_data[-test_length:].index

    all_metrics = {}
    all_backtest_df = {}
    sentiments ={}
    for model_name in results_dict:
        true = results_dict[model_name]["true"]
        pred = results_dict[model_name]["pred"]


        backtest_df, stats = simplified_backtest(
            test_data=true,
            pred_prices=pred,
            transaction_cost=0.0002
        )
        sentiment =  compute_sentiment(true['close'], pred, test_data)
        sentiments[model_name] = sentiment

        # metrics = backtest_with_metrics(results_dict[model_name]["true"], pred,window_size=window_size)
        # metrics = enhanced_backtest(
        #     data_df=results_dict[model_name]["true"],
        #     pred_values=pred,
        #     init_cash=1e6,
        #     commission=0.0002,
        #     window_size=30,
        #     risk_pct=0.01,
        #     rr_ratio=2.5,
        #     trend_filter=True,
        #     debug=True
        # )
        # results, metrics = enhanced_model_backtest(true, pred)
        all_metrics[model_name] = stats
        all_backtest_df[model_name] = backtest_df.reset_index().to_json(orient='records', date_format='iso')
        # 打印详细报告
        print(f"\n{model_name} 综合表现报告:")
        for k, v in stats.items():
            if isinstance(v, float):
                print(f"{k}: {v:.4f}" if abs(v) < 1 else f"{k}: {v:.2f}")
            else:
                print(f"{k}: {v}")


    # metrics_df = visualize_results(results_dict)
    # 打印各模型的评估指标
    # print(metrics_df)
    conf_ints = conf_ints_df.reset_index().to_json(orient='records', date_format='iso')
    save_viz_data(raw_data, results_dict, all_backtest_df,features, all_metrics, conf_ints,sentiments)



if __name__ == '__main__':
    main()
