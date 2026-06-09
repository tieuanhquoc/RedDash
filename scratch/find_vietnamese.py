import os
import re

pattern = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.IGNORECASE)

def scan_dir(dir_path):
    for root, dirs, files in os.walk(dir_path):
        if "node_modules" in root or ".next" in root or "out" in root:
            continue
        if "lib/i18n" in root:
            continue
        for file in files:
            if file.endswith(".tsx") or file.endswith(".ts"):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    printed_file = False
                    for idx, line in enumerate(lines):
                        if pattern.search(line):
                            # Skip comments
                            stripped = line.strip()
                            if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                                continue
                            if not printed_file:
                                print(f"\n--- FILE: {path} ---")
                                printed_file = True
                            print(f"L{idx+1}: {stripped}")
                except Exception as e:
                    print(f"Error reading {path}: {e}")

if __name__ == "__main__":
    scan_dir("components")
    scan_dir("lib")
