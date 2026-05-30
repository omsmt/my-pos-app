"""
Reads data from the xlsx file and merges it into inventory.json by SKU.
- Updates quantity, cost, description, and category for existing items.
- Inserts new items (with price=0) for SKUs not already in the JSON.
Run with: python3 merge_quantity.py
"""

import zipfile
import xml.etree.ElementTree as ET
import json

XLSX_FILE = 'master_list_final_v6.xlsx'
JSON_FILE = 'inventory_2.json'
NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_xlsx_rows(path):
    rows_data = []
    with zipfile.ZipFile(path) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss = ET.parse(z.open('xl/sharedStrings.xml'))
            for si in ss.findall('.//ns:si', NS):
                t = ''.join(node.text or '' for node in si.findall('.//ns:t', NS))
                strings.append(t)

        def cell_value(c):
            if c.get('t') == 'inlineStr':
                is_elem = c.find('ns:is/ns:t', NS)
                return is_elem.text if is_elem is not None else None
            v = c.find('ns:v', NS)
            if v is None:
                return None
            return strings[int(v.text)] if c.get('t') == 's' else v.text

        def idx_to_col(i):
            result = ''
            i += 1
            while i:
                i, r = divmod(i - 1, 26)
                result = chr(65 + r) + result
            return result

        ws = ET.parse(z.open('xl/worksheets/sheet1.xml'))
        rows = ws.findall('.//ns:row', NS)

        header = [cell_value(c) for c in rows[0].findall('ns:c', NS)]
        sku_col = header.index('SKU')
        desc_col = header.index('Item Description')
        cat_col = header.index('Category')
        cost_col = header.index('Cost')
        qty_col = header.index('Quantity')

        col_map = {
            'sku': idx_to_col(sku_col),
            'description': idx_to_col(desc_col),
            'category': idx_to_col(cat_col),
            'cost': idx_to_col(cost_col),
            'quantity': idx_to_col(qty_col),
        }

        for row in rows[1:]:
            cell_map = {}
            for c in row.findall('ns:c', NS):
                col_letter = ''.join(ch for ch in c.get('r') if ch.isalpha())
                cell_map[col_letter] = c

            def get(field):
                letter = col_map[field]
                return cell_value(cell_map[letter]) if letter in cell_map else None

            sku = get('sku')
            if not sku:
                continue

            rows_data.append({
                'sku': sku,
                'description': (get('description') or '').strip(),
                'category': get('category') or '',
                'cost': get('cost'),
                'quantity': get('quantity'),
            })

    return rows_data


def merge(xlsx_rows, json_path):
    try:
        with open(json_path, 'r') as f:
            inventory = json.load(f)
    except FileNotFoundError:
        inventory = []

    existing = {item['sku']: item for item in inventory}

    updated = 0
    added = 0

    for row in xlsx_rows:
        sku = row['sku']

        try:
            qty = int(float(row['quantity'])) if row['quantity'] is not None else 0
        except (ValueError, TypeError):
            qty = 0

        try:
            cost = float(row['cost']) if row['cost'] is not None else 0.0
        except (ValueError, TypeError):
            cost = 0.0

        if sku in existing:
            existing[sku]['quantity'] = qty
            existing[sku]['cost'] = cost
            existing[sku]['description'] = row['description']
            existing[sku]['category'] = row['category']
            updated += 1
        else:
            inventory.append({
                'sku': sku,
                'description': row['description'],
                'category': row['category'],
                'cost': cost,
                'price': 0,
                'quantity': qty,
            })
            added += 1

    with open(json_path, 'w') as f:
        json.dump(inventory, f, indent=4)

    print(f"Done. {updated} items updated, {added} new items added.")


if __name__ == '__main__':
    xlsx_rows = read_xlsx_rows(XLSX_FILE)
    merge(xlsx_rows, JSON_FILE)
