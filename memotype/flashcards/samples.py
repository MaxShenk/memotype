"""Built-in country capitals and the generic sample decks copied on first use."""

from __future__ import annotations

import json
from pathlib import Path

from memotype.paths import flash_samples_dir, resource_path

CAPITALS = [
    ("Afghanistan", "Kabul"),
    ("Albania", "Tirana"),
    ("Algeria", "Algiers"),
    ("Andorra", "Andorra la Vella"),
    ("Angola", "Luanda"),
    ("Antigua and Barbuda", "Saint John's"),
    ("Argentina", "Buenos Aires"),
    ("Armenia", "Yerevan"),
    ("Australia", "Canberra"),
    ("Austria", "Vienna"),
    ("Azerbaijan", "Baku"),
    ("Bahamas", "Nassau"),
    ("Bahrain", "Manama"),
    ("Bangladesh", "Dhaka"),
    ("Barbados", "Bridgetown"),
    ("Belarus", "Minsk"),
    ("Belgium", "Brussels"),
    ("Belize", "Belmopan"),
    ("Benin", "Porto-Novo"),
    ("Bhutan", "Thimphu"),
    ("Bolivia", "La Paz"),
    ("Bosnia and Herzegovina", "Sarajevo"),
    ("Botswana", "Gaborone"),
    ("Brazil", "Brasilia"),
    ("Brunei", "Bandar Seri Begawan"),
    ("Bulgaria", "Sofia"),
    ("Burkina Faso", "Ouagadougou"),
    ("Burundi", "Gitega"),
    ("Cabo Verde", "Praia"),
    ("Cambodia", "Phnom Penh"),
    ("Cameroon", "Yaounde"),
    ("Canada", "Ottawa"),
    ("Central African Republic", "Bangui"),
    ("Chad", "N'Djamena"),
    ("Chile", "Santiago"),
    ("China", "Beijing"),
    ("Colombia", "Bogota"),
    ("Comoros", "Moroni"),
    ("Costa Rica", "San Jose"),
    ("Croatia", "Zagreb"),
    ("Cuba", "Havana"),
    ("Cyprus", "Nicosia"),
    ("Czechia", "Prague"),
    ("Democratic Republic of the Congo", "Kinshasa"),
    ("Denmark", "Copenhagen"),
    ("Djibouti", "Djibouti"),
    ("Dominica", "Roseau"),
    ("Dominican Republic", "Santo Domingo"),
    ("Ecuador", "Quito"),
    ("Egypt", "Cairo"),
    ("El Salvador", "San Salvador"),
    ("Equatorial Guinea", "Malabo"),
    ("Eritrea", "Asmara"),
    ("Estonia", "Tallinn"),
    ("Eswatini", "Mbabane"),
    ("Ethiopia", "Addis Ababa"),
    ("Fiji", "Suva"),
    ("Finland", "Helsinki"),
    ("France", "Paris"),
    ("Gabon", "Libreville"),
    ("Gambia", "Banjul"),
    ("Georgia", "Tbilisi"),
    ("Germany", "Berlin"),
    ("Ghana", "Accra"),
    ("Greece", "Athens"),
    ("Grenada", "Saint George's"),
    ("Guatemala", "Guatemala City"),
    ("Guinea", "Conakry"),
    ("Guinea-Bissau", "Bissau"),
    ("Guyana", "Georgetown"),
    ("Haiti", "Port-au-Prince"),
    ("Honduras", "Tegucigalpa"),
    ("Hungary", "Budapest"),
    ("Iceland", "Reykjavik"),
    ("India", "New Delhi"),
    ("Indonesia", "Jakarta"),
    ("Iran", "Tehran"),
    ("Iraq", "Baghdad"),
    ("Ireland", "Dublin"),
    ("Israel", "Jerusalem"),
    ("Italy", "Rome"),
    ("Ivory Coast", "Yamoussoukro"),
    ("Jamaica", "Kingston"),
    ("Japan", "Tokyo"),
    ("Jordan", "Amman"),
    ("Kazakhstan", "Astana"),
    ("Kenya", "Nairobi"),
    ("Kiribati", "Tarawa"),
    ("Kuwait", "Kuwait City"),
    ("Kyrgyzstan", "Bishkek"),
    ("Laos", "Vientiane"),
    ("Latvia", "Riga"),
    ("Lebanon", "Beirut"),
    ("Lesotho", "Maseru"),
    ("Liberia", "Monrovia"),
    ("Libya", "Tripoli"),
    ("Liechtenstein", "Vaduz"),
    ("Lithuania", "Vilnius"),
    ("Luxembourg", "Luxembourg"),
    ("Madagascar", "Antananarivo"),
    ("Malawi", "Lilongwe"),
    ("Malaysia", "Kuala Lumpur"),
    ("Maldives", "Male"),
    ("Mali", "Bamako"),
    ("Malta", "Valletta"),
    ("Marshall Islands", "Majuro"),
    ("Mauritania", "Nouakchott"),
    ("Mauritius", "Port Louis"),
    ("Mexico", "Mexico City"),
    ("Micronesia", "Palikir"),
    ("Moldova", "Chisinau"),
    ("Monaco", "Monaco"),
    ("Mongolia", "Ulaanbaatar"),
    ("Montenegro", "Podgorica"),
    ("Morocco", "Rabat"),
    ("Mozambique", "Maputo"),
    ("Myanmar", "Naypyidaw"),
    ("Namibia", "Windhoek"),
    ("Nauru", "Yaren"),
    ("Nepal", "Kathmandu"),
    ("Netherlands", "Amsterdam"),
    ("New Zealand", "Wellington"),
    ("Nicaragua", "Managua"),
    ("Niger", "Niamey"),
    ("Nigeria", "Abuja"),
    ("North Korea", "Pyongyang"),
    ("North Macedonia", "Skopje"),
    ("Norway", "Oslo"),
    ("Oman", "Muscat"),
    ("Pakistan", "Islamabad"),
    ("Palau", "Ngerulmud"),
    ("Panama", "Panama City"),
    ("Papua New Guinea", "Port Moresby"),
    ("Paraguay", "Asuncion"),
    ("Peru", "Lima"),
    ("Philippines", "Manila"),
    ("Poland", "Warsaw"),
    ("Portugal", "Lisbon"),
    ("Qatar", "Doha"),
    ("Republic of the Congo", "Brazzaville"),
    ("Romania", "Bucharest"),
    ("Russia", "Moscow"),
    ("Rwanda", "Kigali"),
    ("Saint Kitts and Nevis", "Basseterre"),
    ("Saint Lucia", "Castries"),
    ("Saint Vincent and the Grenadines", "Kingstown"),
    ("Samoa", "Apia"),
    ("San Marino", "San Marino"),
    ("Sao Tome and Principe", "Sao Tome"),
    ("Saudi Arabia", "Riyadh"),
    ("Senegal", "Dakar"),
    ("Serbia", "Belgrade"),
    ("Seychelles", "Victoria"),
    ("Sierra Leone", "Freetown"),
    ("Singapore", "Singapore"),
    ("Slovakia", "Bratislava"),
    ("Slovenia", "Ljubljana"),
    ("Solomon Islands", "Honiara"),
    ("Somalia", "Mogadishu"),
    ("South Africa", "Pretoria"),
    ("South Korea", "Seoul"),
    ("South Sudan", "Juba"),
    ("Spain", "Madrid"),
    ("Sri Lanka", "Colombo"),
    ("Sudan", "Khartoum"),
    ("Suriname", "Paramaribo"),
    ("Sweden", "Stockholm"),
    ("Switzerland", "Bern"),
    ("Syria", "Damascus"),
    ("Taiwan", "Taipei"),
    ("Tajikistan", "Dushanbe"),
    ("Tanzania", "Dodoma"),
    ("Thailand", "Bangkok"),
    ("Timor-Leste", "Dili"),
    ("Togo", "Lome"),
    ("Tonga", "Nuku'alofa"),
    ("Trinidad and Tobago", "Port of Spain"),
    ("Tunisia", "Tunis"),
    ("Turkey", "Ankara"),
    ("Turkmenistan", "Ashgabat"),
    ("Tuvalu", "Funafuti"),
    ("Uganda", "Kampala"),
    ("Ukraine", "Kyiv"),
    ("United Arab Emirates", "Abu Dhabi"),
    ("United Kingdom", "London"),
    ("United States", "Washington"),
    ("Uruguay", "Montevideo"),
    ("Uzbekistan", "Tashkent"),
    ("Vanuatu", "Port Vila"),
    ("Vatican City", "Vatican City"),
    ("Venezuela", "Caracas"),
    ("Vietnam", "Hanoi"),
    ("Yemen", "Sana'a"),
    ("Zambia", "Lusaka"),
    ("Zimbabwe", "Harare"),
]

BUILTIN_ID = "builtin:country-capitals"


def capitals_path() -> Path:
    return resource_path("assets/decks/country-capitals.json")


def write_capitals_file(path: Path | None = None) -> Path:
    target = path or capitals_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    cards = [{"term": country, "definition": capital} for country, capital in CAPITALS]
    target.write_text(json.dumps(cards, indent=2), encoding="utf-8")
    return target


def ensure_samples() -> Path:
    folder = flash_samples_dir()
    marker = folder / ".initialized"
    if marker.exists():
        return folder
    images = folder / "images"
    images.mkdir(parents=True, exist_ok=True)
    _block(images / "wide.png", 800, 300, (37, 99, 235), "Wide")
    _block(images / "tall.png", 300, 800, (21, 128, 61), "Tall")
    _block(images / "square.png", 400, 400, (194, 65, 12), "Square")
    (folder / "tiny.json").write_text(
        json.dumps(
            [
                {"term": "2 + 2", "definition": "4"},
                {"term": "Days in a week", "definition": "7"},
                {"term": "Primary colors", "definition": "Red, yellow, and blue"},
            ],
            indent=2,
        ),
        encoding="utf-8",
    )
    (folder / "shapes.json").write_text(
        json.dumps(
            [
                {"term": "Wide", "image": "images/wide.png", "definition": "A wide rectangle"},
                {"term": "Tall", "image": "images/tall.png", "definition": "A tall rectangle"},
                {"term": "Square", "image": "images/square.png", "definition": "A square"},
            ],
            indent=2,
        ),
        encoding="utf-8",
    )
    (folder / "picture-only.json").write_text(
        json.dumps(
            [
                {"term": "", "image": "images/wide.png", "definition": "Wide rectangle"},
                {"term": "", "image": "images/tall.png", "definition": "Tall rectangle"},
                {"term": "", "image": "images/square.png", "definition": "Square"},
            ],
            indent=2,
        ),
        encoding="utf-8",
    )
    marker.write_text("1", encoding="utf-8")
    return folder


def _block(path: Path, width: int, height: int, color: tuple[int, int, int], label: str) -> None:
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (width, height), color)
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, width - 17, height - 17), outline="white", width=8)
    try:
        font = ImageFont.truetype("segoeui.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
    draw.text((width / 2, height / 2), label, fill="white", font=font, anchor="mm")
    image.save(path, format="PNG")
