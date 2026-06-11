from __future__ import annotations


DEFAULT_REUSE_RULES = {
    "党群服务中心": ["清凉中心", "高温预警", "老人照护", "志愿服务"],
    "社区服务中心": ["清凉中心", "高温预警", "公共休息"],
    "社区食堂": ["助餐", "饮水", "休息", "老人社交"],
    "社区卫生服务站": ["高温健康咨询", "慢病取药", "应急救助"],
    "药店": ["慢病取药", "防暑药品"],
    "图书馆": ["避暑", "儿童托管", "安静停留"],
    "文化站": ["避暑", "老人活动", "儿童活动"],
    "公园驿站": ["饮水", "公厕", "户外劳动者休息"],
    "公交站": ["遮阴候车", "清凉路径节点"],
}


def infer_reuse_functions(poi_type: str, poi_name: str = "") -> list[str]:
    """Infer potential reuse functions from POI type/name with simple rules."""
    text = f"{poi_type} {poi_name}"
    functions: list[str] = []
    for key, values in DEFAULT_REUSE_RULES.items():
        if key in text:
            functions.extend(values)
    return sorted(set(functions))


def infer_publicness(poi_type: str, poi_name: str = "") -> str:
    """Infer publicness level from POI type/name."""
    text = f"{poi_type} {poi_name}"
    high_keywords = ["党群", "社区", "居委", "图书馆", "文化", "卫生", "公园", "公交"]
    medium_keywords = ["食堂", "药店", "商场", "超市", "便利店"]
    if any(keyword in text for keyword in high_keywords):
        return "high"
    if any(keyword in text for keyword in medium_keywords):
        return "medium"
    return "low"

