from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class WeatherInterval:
    factor: float
    temperature_c: float
    relative_humidity_percent: float
    wind_speed_m_s: float
    solar_radiation_w_m2_proxy: float
    observed_minutes: float


class HourlyWeatherModifier:
    def __init__(self, hourly_csv: Path, scenario_date: str) -> None:
        frame = pd.read_csv(hourly_csv, low_memory=False)
        required = {
            "date_beijing",
            "hour_beijing",
            "t2m_c",
            "relative_humidity_percent",
            "wind_speed_10m_m_s",
            "surface_solar_radiation_w_m2_proxy",
            "weather_factor",
        }
        missing = sorted(required.difference(frame.columns))
        if missing:
            raise ValueError(f"{hourly_csv} is missing weather columns: {missing}")
        selected = frame[frame["date_beijing"].astype(str) == scenario_date].copy()
        if selected.empty:
            raise ValueError(f"No ERA5-Land hourly weather found for scenario date {scenario_date}")
        selected["hour_beijing"] = pd.to_numeric(selected["hour_beijing"], errors="coerce").astype(int)
        self.hourly_csv = hourly_csv
        self.scenario_date = scenario_date
        self._rows = selected.set_index("hour_beijing").to_dict(orient="index")

    def interval(
        self,
        start_minute: float,
        duration_minutes: float,
        active_period: tuple[int, int],
    ) -> WeatherInterval:
        interval_start = max(float(start_minute), float(active_period[0]))
        interval_end = min(float(start_minute + duration_minutes), float(active_period[1]))
        if interval_end <= interval_start:
            return WeatherInterval(1.0, 0.0, 0.0, 0.0, 0.0, 0.0)

        weighted = {
            "weather_factor": 0.0,
            "t2m_c": 0.0,
            "relative_humidity_percent": 0.0,
            "wind_speed_10m_m_s": 0.0,
            "surface_solar_radiation_w_m2_proxy": 0.0,
        }
        observed_minutes = 0.0
        cursor = interval_start
        while cursor < interval_end:
            hour = int(cursor // 60) % 24
            hour_end = min(interval_end, (int(cursor // 60) + 1) * 60)
            minutes = hour_end - cursor
            row = self._rows.get(hour)
            if row is not None:
                for key in weighted:
                    weighted[key] += float(row[key]) * minutes
                observed_minutes += minutes
            cursor = hour_end

        if observed_minutes <= 0:
            return WeatherInterval(1.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        return WeatherInterval(
            factor=weighted["weather_factor"] / observed_minutes,
            temperature_c=weighted["t2m_c"] / observed_minutes,
            relative_humidity_percent=weighted["relative_humidity_percent"] / observed_minutes,
            wind_speed_m_s=weighted["wind_speed_10m_m_s"] / observed_minutes,
            solar_radiation_w_m2_proxy=weighted["surface_solar_radiation_w_m2_proxy"] / observed_minutes,
            observed_minutes=observed_minutes,
        )
