"""
Reads data from the xlsx file and merges it into inventory.json by SKU.
- Updates quantity, cost, description, and category for existing items.
- Inserts new items (with price=0) for SKUs not already in the JSON.
Run with: python3 merge_quantity.py
"""

import zipfile
import xml.etree.ElementTree as ET
import json

XLSX_FILE = 'Montes_Collectibles_Master_2026-07-24.xlsx'
JSON_FILE = 'inventory.json'
SHEET_NAME = 'Master SKU List'
NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL_NS = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
WB_REL_NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
             'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def find_sheet_path(z, sheet_name):
    wb = ET.parse(z.open('xl/workbook.xml'))
    sheet_el = next(
        s for s in wb.findall('.//ns:sheets/ns:sheet', WB_REL_NS)
        if s.get('name') == sheet_name
    )
    rid = sheet_el.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    rels = ET.parse(z.open('xl/_rels/workbook.xml.rels'))
    rel_el = next(r for r in rels.findall('.//r:Relationship', REL_NS) if r.get('Id') == rid)
    return 'xl/' + rel_el.get('Target')


def read_xlsx_rows(path):
    rows_data = []
    with zipfile.ZipFile(path) as z:
        sheet_path = find_sheet_path(z, SHEET_NAME)
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

        ws = ET.parse(z.open(sheet_path))
        rows = ws.findall('.//ns:row', NS)

        header = [cell_value(c) for c in rows[0].findall('ns:c', NS)]
        sku_col = header.index('SKU')
        desc_col = header.index('Item Description')
        cat_col = header.index('Category')
        cost_col = header.index('Cost')
        qty_col = header.index('Quantity')

        # Locate price column by trying common names (case-insensitive)
        header_lower = [h.lower() if h else '' for h in header]
        price_col_idx = next(
            (i for i in range(len(header_lower)) if header_lower[i] in ('price', 'prices')),
            None
        )

        col_map = {
            'sku': idx_to_col(sku_col),
            'description': idx_to_col(desc_col),
            'category': idx_to_col(cat_col),
            'cost': idx_to_col(cost_col),
            'quantity': idx_to_col(qty_col),
        }
        if price_col_idx is not None:
            col_map['price'] = idx_to_col(price_col_idx)

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
                'price': get('price') if 'price' in col_map else None,
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

        try:
            price = float(row['price']) if row['price'] is not None else None
        except (ValueError, TypeError):
            price = None

        if sku in existing:
            existing[sku]['quantity'] = qty
            existing[sku]['cost'] = cost
            existing[sku]['description'] = row['description']
            existing[sku]['category'] = row['category']
            if price is not None:
                existing[sku]['price'] = price
            elif 'price' not in existing[sku]:
                existing[sku]['price'] = 0
            updated += 1
        else:
            inventory.append({
                'sku': sku,
                'description': row['description'],
                'category': row['category'],
                'cost': cost,
                'price': price if price is not None else 0,
                'quantity': qty,
            })
            added += 1

    with open(json_path, 'w') as f:
        json.dump(inventory, f, indent=4)

    print(f"Done. {updated} items updated, {added} new items added.")


if __name__ == '__main__':
    xlsx_rows = read_xlsx_rows(XLSX_FILE)
    merge(xlsx_rows, JSON_FILE)
