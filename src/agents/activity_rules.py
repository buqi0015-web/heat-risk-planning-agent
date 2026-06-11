from __future__ import annotations

import random


TRIP_PURPOSES_BY_AGENT = {
    "elderly_living_alone": {
        "flexible_necessary": ["买菜", "买药", "助餐"],
        "leisure": ["散步", "公园活动", "短时购物"],
    },
    "elderly_chronic_disease": {
        "fixed_time_necessary": ["预约就医"],
        "flexible_necessary": ["买药", "买菜", "助餐"],
        "accompanied_trip": ["陪老人就医"],
    },
    "child_parent": {
        "fixed_time_necessary": ["接送儿童", "通勤接驳"],
        "accompanied_trip": ["带儿童活动"],
        "leisure": ["公园活动", "短时购物", "散步"],
    },
    "university_student": {
        "fixed_time_necessary": ["高校通学", "通勤接驳"],
        "flexible_necessary": ["短时购物", "买菜", "买药"],
        "leisure": ["校园活动", "公园活动", "短时购物"],
    },
    "household_maintainer": {
        "flexible_necessary": ["买菜", "买药", "短时购物", "助餐"],
        "accompanied_trip": ["陪老人就医", "带儿童活动"],
        "leisure": ["散步", "公园活动", "短时购物"],
    },
    "outdoor_worker": {
        "outdoor_work": ["配送", "快递", "巡查"],
    },
    "commuter": {
        "fixed_time_necessary": ["通勤接驳", "短时购物"],
    },
}

ACTIVITY_NECESSITY_BY_PURPOSE = {
    "接送儿童": 0.95,
    "高校通学": 0.85,
    "校园活动": 0.35,
    "通勤接驳": 0.95,
    "预约就医": 0.95,
    "买菜": 0.80,
    "买药": 0.90,
    "助餐": 0.85,
    "散步": 0.25,
    "公园活动": 0.25,
    "短时购物": 0.40,
    "配送": 1.00,
    "快递": 1.00,
    "巡查": 0.95,
    "陪老人就医": 0.95,
    "带儿童活动": 0.70,
}


PURPOSE_DEPARTURE_WINDOWS = {
    "接送儿童": [(7 * 60, 8 * 60), (15 * 60 + 30, 17 * 60)],
    "高校通学": [(7 * 60 + 30, 10 * 60), (16 * 60 + 30, 19 * 60)],
    "校园活动": [(10 * 60, 12 * 60), (15 * 60, 18 * 60)],
    "通勤接驳": [(7 * 60, 9 * 60), (17 * 60, 19 * 60)],
    "预约就医": [(8 * 60, 10 * 60 + 30)],
    "买菜": [(7 * 60, 10 * 60 + 30)],
    "买药": [(8 * 60, 11 * 60)],
    "助餐": [(10 * 60 + 30, 12 * 60)],
    "散步": [(6 * 60 + 30, 9 * 60), (17 * 60, 19 * 60)],
    "公园活动": [(7 * 60, 10 * 60), (16 * 60 + 30, 18 * 60 + 30)],
    "短时购物": [(9 * 60, 11 * 60), (16 * 60, 18 * 60)],
    "配送": [(10 * 60, 16 * 60)],
    "快递": [(9 * 60, 17 * 60)],
    "巡查": [(10 * 60, 16 * 60)],
    "陪老人就医": [(8 * 60, 10 * 60 + 30)],
    "带儿童活动": [(9 * 60, 11 * 60), (15 * 60, 17 * 60)],
}

PURPOSE_DWELL_MINUTES = {
    "接送儿童": (8, 20),
    "高校通学": (10, 25),
    "校园活动": (25, 70),
    "通勤接驳": (5, 12),
    "预约就医": (20, 45),
    "买菜": (12, 30),
    "买药": (8, 20),
    "助餐": (20, 45),
    "散步": (20, 45),
    "公园活动": (30, 75),
    "短时购物": (15, 35),
    "配送": (5, 12),
    "快递": (5, 12),
    "巡查": (10, 25),
    "陪老人就医": (20, 45),
    "带儿童活动": (25, 60),
}

PURPOSE_MAX_DISTANCE_M = {
    "接送儿童": 3000,
    "高校通学": 5000,
    "校园活动": 2500,
    "通勤接驳": 4500,
    "预约就医": 6000,
    "买菜": 1800,
    "买药": 1800,
    "助餐": 1500,
    "散步": 1600,
    "公园活动": 2500,
    "短时购物": 2000,
    "配送": 6000,
    "快递": 6000,
    "巡查": 6000,
    "陪老人就医": 6000,
    "带儿童活动": 3500,
}

FACILITY_NEEDS_BY_PURPOSE = {
    "接送儿童": ["校门口遮阴", "短时等候点", "饮水点", "安全步行遮阴路径"],
    "高校通学": ["高校出入口遮阴", "公交地铁接驳遮阴", "饮水点", "校园周边清凉路径"],
    "校园活动": ["校园周边遮阴活动空间", "图书馆或文化空间", "饮水点", "公园驿站"],
    "通勤接驳": ["公交站遮阳", "地铁接驳遮阴", "清凉路径节点"],
    "预约就医": ["沿途短停休息点", "社区卫生服务联动", "饮水点"],
    "买菜": ["沿途短停休息点", "饮水点", "社区食堂或党群服务中心复合清凉点"],
    "买药": ["药店联动休息点", "社区卫生服务站", "饮水点"],
    "助餐": ["社区食堂清凉点", "党群服务中心", "饮水与座椅"],
    "散步": ["公园驿站", "遮阴活动空间", "饮水点"],
    "公园活动": ["公园驿站", "遮阴活动空间", "公厕与饮水"],
    "短时购物": ["商超周边短停点", "遮阴步行路径"],
    "配送": ["清凉驿站", "饮水点", "公厕", "充电点"],
    "快递": ["清凉驿站", "饮水点", "公厕", "短时补给点"],
    "巡查": ["清凉驿站", "饮水点", "遮阴休息点"],
    "陪老人就医": ["无障碍休息点", "沿途遮阴", "社区卫生服务联动"],
    "带儿童活动": ["儿童友好遮阴空间", "饮水点", "短时休息点"],
}

SUITABLE_FACILITY_TYPES_BY_PURPOSE = {
    "接送儿童": ["学校周边遮阴点", "公交站遮阳", "饮水点"],
    "高校通学": ["高校周边遮阴点", "公交站遮阳", "地铁站", "饮水点"],
    "校园活动": ["图书馆", "文化站", "公园驿站", "遮阴活动区"],
    "通勤接驳": ["公交站", "地铁站", "沿路遮阴节点"],
    "预约就医": ["社区卫生服务站", "党群服务中心", "药店"],
    "买菜": ["党群服务中心", "社区食堂", "菜市场周边休息点"],
    "买药": ["药店", "社区卫生服务站", "党群服务中心"],
    "助餐": ["社区食堂", "党群服务中心"],
    "散步": ["公园驿站", "文化站", "图书馆"],
    "公园活动": ["公园驿站", "公厕", "饮水点"],
    "短时购物": ["商超", "党群服务中心", "社区服务中心"],
    "配送": ["清凉驿站", "公厕", "便利店", "充电点"],
    "快递": ["清凉驿站", "公厕", "便利店", "社区服务中心"],
    "巡查": ["清凉驿站", "公厕", "社区服务中心"],
    "陪老人就医": ["社区卫生服务站", "党群服务中心", "无障碍休息点"],
    "带儿童活动": ["图书馆", "文化站", "公园驿站"],
}


def format_minutes(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def sample_departure_time(purpose: str, rng: random.Random) -> tuple[int, str]:
    windows = PURPOSE_DEPARTURE_WINDOWS[purpose]
    start, end = rng.choice(windows)
    minutes = rng.randint(start, max(start, end - 1))
    return minutes, format_minutes(minutes)


def sample_dwell_minutes(purpose: str, rng: random.Random) -> int:
    start, end = PURPOSE_DWELL_MINUTES[purpose]
    return rng.randint(start, end)


def overlap_minutes(start_minute: float, duration_minutes: float, period: tuple[int, int]) -> float:
    end_minute = start_minute + duration_minutes
    return max(0.0, min(end_minute, period[1]) - max(start_minute, period[0]))


def facility_needs(purpose: str) -> list[str]:
    return FACILITY_NEEDS_BY_PURPOSE.get(purpose, [])


def suitable_facility_types(purpose: str) -> list[str]:
    return SUITABLE_FACILITY_TYPES_BY_PURPOSE.get(purpose, [])


def max_destination_distance_m(purpose: str) -> float:
    return float(PURPOSE_MAX_DISTANCE_M.get(purpose, 5000))


def failure_zone(action: str, trip_type: str, cooling_accessibility: float) -> str:
    if action == "cancel":
        return "origin"
    if trip_type == "fixed_time_necessary":
        return "destination" if cooling_accessibility < 0.35 else "path"
    if trip_type == "outdoor_work":
        return "path"
    if cooling_accessibility < 0.35:
        return "path"
    return "destination"


def behavior_reason(purpose: str, action: str, zone: str) -> str:
    action_text = {
        "normal": "热暴露和设施可达条件尚可，活动可正常完成。",
        "risky_completion": "活动必要性较高，高温下仍倾向完成，但存在较高户外热暴露。",
        "cancel": "活动必要性较低或热压力过高，活动被取消。",
        "delay": "活动具有一定时间弹性，高温下倾向避开高温时段。",
        "substitute": "活动可替代，Agent 倾向选择更近或热暴露更低的目的地。",
        "shorten": "活动仍需完成，但会压缩户外停留或活动持续时间。",
        "add_stop": "活动仍需完成，且存在使用短停清凉设施中断热暴露的可能。",
    }
    return f"{purpose}：{action_text.get(action, '')} 主要失效位置判定为{zone}。"
