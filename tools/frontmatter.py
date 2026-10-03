"""Small frontmatter reader/writer for the site's JSON-compatible YAML subset."""

import json


def scalar(value):
    value = value.strip()
    if not value:
        return ""
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return value.strip("\"'")


def parse(text):
    if not text.startswith("---\n"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) != 3:
        return {}, text
    meta = {}
    current = None
    for line in parts[1].splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" ") and ":" in line:
            key, value = line.split(":", 1)
            current = key.strip()
            meta[current] = scalar(value) if value.strip() else []
        elif current and line.startswith("  -"):
            content = line[3:].strip()
            if content and ":" in content and not content.startswith(('"', "'")):
                key, value = content.split(":", 1)
                meta[current].append({key.strip(): scalar(value)})
            elif content:
                meta[current].append(scalar(content))
            else:
                meta[current].append({})
        elif current and line.startswith("    ") and isinstance(meta[current], list) and meta[current] and isinstance(meta[current][-1], dict) and ":" in line:
            key, value = line.strip().split(":", 1)
            meta[current][-1][key.strip()] = scalar(value)
    return meta, parts[2].lstrip("\n")


def dump(meta, body):
    lines = ["---"]
    for key, value in meta.items():
        if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            lines.append(f"{key}:")
            for item in value:
                entries = list(item.items())
                for index, (item_key, item_value) in enumerate(entries):
                    prefix = "  - " if index == 0 else "    "
                    lines.append(f"{prefix}{item_key}: {json.dumps(item_value, ensure_ascii=False)}")
        elif isinstance(value, list) and value and all(isinstance(item, str) for item in value) and key == "related_notes":
            lines.append(f"{key}:")
            lines.extend(f"  - {json.dumps(item, ensure_ascii=False)}" for item in value)
        else:
            lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    lines.extend(["---", "", body.strip(), ""])
    return "\n".join(lines)
