import json
import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

p = '賬號密碼.xlsx'
print('exists', os.path.exists(p))

with zipfile.ZipFile(p) as z:
    shared = []
    try:
        data = z.read('xl/sharedStrings.xml').decode('utf-8')
        root = ET.fromstring(data)
        ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        shared = [''.join(t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')) for si in root.findall('a:si', ns)]
    except Exception as e:
        print('shared err', e)

    wb = ET.fromstring(z.read('xl/workbook.xml').decode('utf-8'))
    ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    sheets = wb.find('a:sheets', ns)
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels').decode('utf-8'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    for sh in sheets:
        name = sh.attrib['name']
        rid = sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rel_map[rid]
        path = 'xl/' + target if not target.startswith('xl/') else target
        if path.startswith('/'):
            path = path[1:]
        sheet = ET.fromstring(z.read(path).decode('utf-8'))
        rows = []
        for row in sheet.findall('.//a:sheetData/a:row', ns):
            vals = []
            for c in row.findall('a:c', ns):
                v = c.find('a:v', ns)
                val = ''
                if v is not None and v.text is not None:
                    val = v.text
                if c.attrib.get('t') == 's' and val.isdigit():
                    idx = int(val)
                    val = shared[idx] if idx < len(shared) else val
                vals.append(val)
            rows.append(vals)
        print('sheet', name)
        for r in rows[:5]:
            print(r)

        header_row_index = next(
            (index for index, row in enumerate(rows) if '登入帳號' in row and '密碼(ID)' in row),
            None,
        )
        if header_row_index is None:
            raise ValueError('找不到包含「登入帳號」和「密碼(ID)」的標題列。')

        headers = rows[header_row_index]
        column_index = {header: index for index, header in enumerate(headers)}
        required_headers = ('中文姓名', '登入帳號', '密碼(ID)')
        missing_headers = [header for header in required_headers if header not in column_index]
        if missing_headers:
            raise ValueError(f'Excel 缺少必要欄位：{", ".join(missing_headers)}')

        accounts = {}
        for row in rows[header_row_index + 1:]:
            if len(row) <= max(column_index[header] for header in required_headers):
                continue
            name = row[column_index['中文姓名']].strip()
            username = row[column_index['登入帳號']].strip()
            password = row[column_index['密碼(ID)']].strip()
            if username and password:
                accounts[username] = {'password': password, 'name': name}

        output = json.dumps(accounts, ensure_ascii=False, indent=4)
        Path('student_accounts.js').write_text(
            f'window.studentAccounts = {output};\n', encoding='utf-8'
        )
        Path('student_accounts.json').write_text(f'{output}\n', encoding='utf-8')
        print(f'generated {len(accounts)} student accounts')
        break
