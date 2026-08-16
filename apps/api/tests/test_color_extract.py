from PIL import Image, ImageDraw

from app.services.color_extract import extract_garment_colors


def test_product_background_does_not_overrule_garment_color(tmp_path):
    image = Image.new("RGB", (240, 300), (248, 246, 242))
    draw = ImageDraw.Draw(image)
    draw.polygon([(70, 55), (170, 55), (205, 260), (35, 260)], fill=(26, 42, 74))
    path = tmp_path / "navy-product.jpg"
    image.save(path)

    features = extract_garment_colors(path)

    assert features["primary_family"] in {"navy", "blue"}
    assert features["background_removed"] is True
    assert features["color_confidence"] > 0.2
