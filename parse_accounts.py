import zipfile, os, xml.etree.ElementTree as ET

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
        for r in rows[:80]:
            print(r)
        break
