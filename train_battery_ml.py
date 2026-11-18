"""
TRAIN_BATTERY_ML.PY
===================
Trains real Machine Learning models on the NASA Ames Prognostics Center of
Excellence (PCoE) Li-ion Battery Aging Dataset (Cells B0005, B0006, B0007, B0018).

Performance on real NASA data:
  - SoH Prediction Model: R² = 0.843, RMSE = 3.69%
  - RUL Remaining Useful Life Estimation: R² = 0.945, MAE = 3.20 cycles (RMSE = 7.11 cycles)
"""

import json
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from sklearn.model_selection import train_test_split
import joblib

def load_and_train():
    df = pd.read_csv("nasa_battery_data.csv")
    nominal_capacity = 2.0  # Ah

    cells = df['battery_id'].unique()
    dfs = []
    for cell in cells:
        cdf = df[df['battery_id'] == cell].copy().sort_values('cycle_index').reset_index(drop=True)
        cdf['soh'] = (cdf['capacity_ah'] / nominal_capacity) * 100.0

        # RUL to 75% Second-life threshold
        eol_candidates = cdf[cdf['soh'] <= 75.0].index
        eol_idx = eol_candidates[0] if len(eol_candidates) > 0 else len(cdf) - 1
        cdf['rul_cycles_to_75'] = np.maximum(0, eol_idx - cdf.index)

        # RUL to 70% Second-life threshold
        eol_70 = cdf[cdf['soh'] <= 70.0].index
        eol_70_idx = eol_70[0] if len(eol_70) > 0 else len(cdf) - 1
        cdf['rul_cycles_to_70'] = np.maximum(0, eol_70_idx - cdf.index)

        # Feature engineering
        cdf['sqrt_cycle'] = np.sqrt(cdf['cycle_index'])
        cdf['sample_throughput'] = cdf['num_samples'] * cdf['cycle_index']
        dfs.append(cdf)

    full_df = pd.concat(dfs, ignore_index=True)

    # 1. Train SoH Regressor (inputs: cycle, sqrt_cycle, ambient_temp, num_samples, sample_throughput)
    X_soh = full_df[['cycle_index', 'sqrt_cycle', 'ambient_temperature', 'num_samples', 'sample_throughput']]
    y_soh = full_df['soh']

    X_train_s, X_test_s, y_train_s, y_test_s = train_test_split(X_soh, y_soh, test_size=0.2, random_state=42)
    soh_model = GradientBoostingRegressor(n_estimators=160, learning_rate=0.08, max_depth=4, random_state=42)
    soh_model.fit(X_train_s, y_train_s)
    soh_preds = soh_model.predict(X_test_s)

    soh_r2 = float(r2_score(y_test_s, soh_preds))
    soh_rmse = float(np.sqrt(mean_squared_error(y_test_s, soh_preds)))
    soh_mae = float(mean_absolute_error(y_test_s, soh_preds))

    # 2. Train RUL Regressor (inputs: current soh, cycle_index, ambient_temperature)
    X_rul = full_df[['soh', 'cycle_index', 'ambient_temperature']]
    y_rul = full_df['rul_cycles_to_75']

    X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_rul, y_rul, test_size=0.2, random_state=42)
    rul_model = GradientBoostingRegressor(n_estimators=150, learning_rate=0.07, max_depth=4, random_state=42)
    rul_model.fit(X_train_r, y_train_r)
    rul_preds = rul_model.predict(X_test_r)

    rul_r2 = float(r2_score(y_test_r, rul_preds))
    rul_rmse = float(np.sqrt(mean_squared_error(y_test_r, rul_preds)))
    rul_mae = float(mean_absolute_error(y_test_r, rul_preds))

    print("================ REAL NASA MODEL RESULTS ================")
    print(f"SoH Prediction -> R²: {soh_r2:.4f} | RMSE: {soh_rmse:.2f}% | MAE: {soh_mae:.2f}%")
    print(f"RUL Estimation -> R²: {rul_r2:.4f} | RMSE: {rul_rmse:.2f} cycles | MAE: {rul_mae:.2f} cycles")

    # Feature importances
    soh_importances = dict(zip(X_soh.columns, [round(float(v), 4) for v in soh_model.feature_importances_]))
    rul_importances = dict(zip(X_rul.columns, [round(float(v), 4) for v in rul_model.feature_importances_]))

    joblib.dump(soh_model, "c:/Sem 6/EV-Battery-Status/battery_soh_model.joblib")
    joblib.dump(rul_model, "c:/Sem 6/EV-Battery-Status/battery_rul_model.joblib")

    # Sample curves of real NASA cells for interactive visualization
    sample_curves = {}
    for cell in ['B0005', 'B0006', 'B0007', 'B0018']:
        cdf = full_df[full_df['battery_id'] == cell]
        sample_curves[cell] = {
            'cycles': cdf['cycle_index'].tolist(),
            'capacity_ah': [round(float(v), 3) for v in cdf['capacity_ah']],
            'soh': [round(float(v), 2) for v in cdf['soh']],
            'temp': int(cdf['ambient_temperature'].iloc[0])
        }

    metadata = {
        'dataset_name': 'NASA Ames Prognostics Center of Excellence (PCoE) Li-ion Battery Run-to-Failure',
        'citation': 'B. Saha and K. Goebel (2007). "Battery Data Set", NASA Ames Prognostics Data Repository, NASA Ames Research Center, Moffett Field, CA.',
        'cells_used': ['B0005', 'B0006', 'B0007', 'B0018'],
        'total_experimental_cycles': len(full_df),
        'chemistry': 'Lithium Nickel Cobalt Oxide (LiNiCoAlO2 / 18650 cells)',
        'nominal_capacity_ah': 2.0,
        'second_life_threshold_ah': 1.4,
        'second_life_threshold_soh': 70.0,
        'metrics': {
            'soh_r2': round(soh_r2, 4),
            'soh_rmse': round(soh_rmse, 2),
            'soh_mae': round(soh_mae, 2),
            'rul_r2': round(rul_r2, 4),
            'rul_rmse_cycles': round(rul_rmse, 2),
            'rul_mae_cycles': round(rul_mae, 2),
            'model_confidence_pct': round(rul_r2 * 100, 1)
        },
        'feature_importances': {
            'soh_model': soh_importances,
            'rul_model': rul_importances
        },
        'sample_curves': sample_curves
    }

    with open("c:/Sem 6/EV-Battery-Status/trained_ml_model.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print("Exported trained_ml_model.json successfully.")

if __name__ == "__main__":
    load_and_train()
