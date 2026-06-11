from __future__ import annotations


RESIDENT_PERSONAS = {
    "elderly_living_alone": {
        "label": "独居老人",
        "daily_goals": ["买菜", "助餐", "买药", "散步"],
        "heat_sensitivity": ["避免中午出行", "需要休息", "需要饮水", "偏好室内避暑"],
        "preferred_poi_types": ["社区食堂", "药店", "社区卫生服务站", "党群服务中心", "公园"],
        "typical_trip_types": ["flexible_necessary", "leisure"],
        "vulnerability_weight": 1.5,
    },
    "elderly_chronic_disease": {
        "label": "慢病老人",
        "daily_goals": ["买药", "健康咨询", "短距离散步"],
        "heat_sensitivity": ["避免暴晒", "需要近距离取药", "需要应急健康支持"],
        "preferred_poi_types": ["药店", "社区卫生服务站", "党群服务中心"],
        "typical_trip_types": ["fixed_time_necessary", "flexible_necessary", "accompanied_trip"],
        "vulnerability_weight": 1.6,
    },
    "child_parent": {
        "label": "学生照护者",
        "daily_goals": ["接送儿童", "校门等候", "儿童陪护活动"],
        "heat_sensitivity": ["时间刚性高", "需要遮阴等候", "需要儿童友好清凉活动点"],
        "preferred_poi_types": ["学校", "幼儿园", "公园", "图书馆", "文化站"],
        "typical_trip_types": ["fixed_time_necessary", "accompanied_trip", "leisure"],
        "vulnerability_weight": 1.2,
    },
    "university_student": {
        "label": "高校学生",
        "daily_goals": ["高校通学", "校园活动", "短时购物", "公园活动"],
        "heat_sensitivity": ["校园与地铁接驳暴露", "午后活动可延迟", "户外停留弹性较高"],
        "preferred_poi_types": ["高校", "地铁站", "公交站", "图书馆", "公园", "便利店"],
        "typical_trip_types": ["fixed_time_necessary", "leisure", "flexible_necessary"],
        "vulnerability_weight": 1.0,
    },
    "household_maintainer": {
        "label": "家庭维护型成年人",
        "daily_goals": ["买菜", "短时购物", "买药", "陪护活动"],
        "heat_sensitivity": ["维护性活动可延迟", "照护活动时间刚性中等", "偏好近距离清凉设施"],
        "preferred_poi_types": ["菜市场", "超市", "药店", "社区服务中心", "党群服务中心"],
        "typical_trip_types": ["flexible_necessary", "accompanied_trip", "leisure"],
        "vulnerability_weight": 1.1,
    },
    "outdoor_worker": {
        "label": "户外劳动者",
        "daily_goals": ["配送", "巡查", "休息", "补给"],
        "heat_sensitivity": ["无法取消出行", "需要饮水", "需要公厕", "需要充电", "需要短暂停留"],
        "preferred_poi_types": ["公交站", "公园驿站", "便利店", "公厕", "社区服务中心"],
        "typical_trip_types": ["outdoor_work"],
        "vulnerability_weight": 1.4,
    },
    "commuter": {
        "label": "通勤居民",
        "daily_goals": ["公交接驳", "地铁接驳", "步行回家", "便利购物"],
        "heat_sensitivity": ["需要遮阴候车", "需要缩短暴晒步行", "偏好清凉路径"],
        "preferred_poi_types": ["公交站", "地铁站", "便利店", "党群服务中心"],
        "typical_trip_types": ["fixed_time_necessary"],
        "vulnerability_weight": 1.0,
    },
}
