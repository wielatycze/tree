"""
export.py — Veliatychi family tree data exporter
Reads the SQLite database and writes JSON files to data/
Run: python3 export.py
"""
import sqlite3, json, os, sys

DB_PATH = os.environ.get('DB_PATH', 'data/tree.sqlite3')
OUT_DIR  = os.environ.get('OUT_DIR',  'data')

os.makedirs(OUT_DIR, exist_ok=True)

def save(name, obj):
    path = os.path.join(OUT_DIR, name + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(path)
    print(f'  {name}.json  {size // 1024} KB')

print(f'Opening {DB_PATH}')
conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

# ── Search index ─────────────────────────────────────────────
# Each entry: [id, sex, given, patronymic, surname, maiden, birth_year]
print('Exporting search index...')
cur.execute('''
    SELECT p.id, p.sex,
        MAX(CASE WHEN vs.f_id=66 THEN vs.vstr END),
        MAX(CASE WHEN vs.f_id=67 THEN vs.vstr END),
        MAX(CASE WHEN vs.f_id=64 THEN vs.vstr END),
        MAX(CASE WHEN vs.f_id=65 THEN vs.vstr END)
    FROM Persons p
    JOIN ValuesStr vs ON vs.rec_id=p.id AND vs.rec_table=13 AND vs.f_id IN (64,65,66,67)
    GROUP BY p.id, p.sex
''')
rows = cur.fetchall()
cur.execute('''
    SELECT ed.p_id, vd.y FROM EventDetails ed
    JOIN Events e  ON e.id=ed.e_id   AND e.et_id=1
    JOIN ValuesDates vd ON vd.rec_id=e.id AND vd.rec_table=7 AND vd.f_id=29
    WHERE ed.er_id=1
''')
by_map = {r[0]: r[1] for r in cur.fetchall()}
si = [[r[0], r[1], r[2] or '', r[3] or '', r[4] or '', r[5] or '', by_map.get(r[0], 0)]
      for r in rows]
save('si', si)

# ── Parents map ─────────────────────────────────────────────
# {child_id: [father_id, mother_id]}
print('Exporting parents...')
cur.execute('''
    SELECT ed1.p_id,
        MAX(CASE WHEN ed2.er_id=2 THEN ed2.p_id END),
        MAX(CASE WHEN ed2.er_id=3 THEN ed2.p_id END)
    FROM EventDetails ed1
    JOIN Events e ON e.id=ed1.e_id AND e.et_id=1
    JOIN EventDetails ed2 ON ed2.e_id=ed1.e_id AND ed2.er_id IN (2,3)
    WHERE ed1.er_id=1
    GROUP BY ed1.p_id
''')
parents = {r[0]: [r[1], r[2]] for r in cur.fetchall()}
save('parents', parents)

# ── Children map ─────────────────────────────────────────────
# {parent_id: [child_id, ...]}  — derived by inverting parents
print('Exporting children...')
children = {}
for ch_id, (fa_id, mo_id) in parents.items():
    if fa_id:
        children.setdefault(fa_id, []).append(ch_id)
    if mo_id:
        children.setdefault(mo_id, []).append(ch_id)
save('children', children)

# ── Marriages map ─────────────────────────────────────────────
# {person_id: [[spouse_id, [y,m,d], [child_ids]], ...]}
# Children are per-couple: only children whose birth event lists BOTH this person and the spouse
print('Exporting marriages...')
cur.execute('SELECT p_id, e_id, er_id FROM EventDetails WHERE er_id IN (5,6)')
ed_rows = cur.fetchall()
event_roles = {}
for pid, eid, er in ed_rows:
    event_roles.setdefault(eid, {})[er] = pid
cur.execute('SELECT rec_id,y,m,d FROM ValuesDates WHERE rec_table=7 AND f_id=29')
edates = {r[0]: [r[1], r[2], r[3]] for r in cur.fetchall()}

# Per-couple children: keyed by (father_id, mother_id)
cur.execute('''
    SELECT
        MAX(CASE WHEN ed.er_id=2 THEN ed.p_id END) as fa,
        MAX(CASE WHEN ed.er_id=3 THEN ed.p_id END) as mo,
        ed_ch.p_id as ch
    FROM EventDetails ed
    JOIN Events e ON e.id=ed.e_id AND e.et_id=1
    JOIN EventDetails ed_ch ON ed_ch.e_id=ed.e_id AND ed_ch.er_id=1
    WHERE ed.er_id IN (2,3)
    GROUP BY ed_ch.p_id
''')
couple_children = {}
for fa, mo, ch in cur.fetchall():
    couple_children.setdefault((fa, mo), []).append(ch)

marriages = {}
for eid, roles in event_roles.items():
    for er in [5, 6]:
        if er not in roles: continue
        pid   = roles[er]
        sp_er = 6 if er == 5 else 5
        sid   = roles.get(sp_er)
        fa    = pid if er == 5 else sid
        mo    = sid if er == 5 else pid
        ch    = couple_children.get((fa, mo), [])
        marriages.setdefault(pid, []).append([sid, edates.get(eid), ch])

# Persons who have children but no marriage record
for ch_id, (fa_id, mo_id) in parents.items():
    ch_id = int(ch_id)
    for par_id in [fa_id, mo_id]:
        if par_id and par_id not in marriages:
            marriages[par_id] = [[None, None, []]]

save('marriages', marriages)

# ── Places map ─────────────────────────────────────────────
# {person_id: "place name"}
print('Exporting places...')
cur.execute('SELECT rec_id, vlink_id FROM ValuesLinks WHERE rec_table=13 AND f_id=63')
person_place_raw = cur.fetchall()
cur.execute('SELECT rec_id, vstr FROM ValuesStr WHERE rec_table=14')
place_names = {r[0]: r[1] for r in cur.fetchall()}
person_place = {r[0]: place_names[r[1]] for r in person_place_raw if r[1] in place_names}
save('places', person_place)

# ── # (num) map ──────────────────────────────────────────────
# {person_id: integer}
print('Exporting nums...')
cur.execute('SELECT rec_id, vint FROM ValuesNum WHERE rec_table=13 AND f_id=4 AND vint IS NOT NULL')
nums = {r[0]: r[1] for r in cur.fetchall()}
save('nums', nums)

# ── Birth dates ───────────────────────────────────────────────
# {person_id: [y, m, d]}
print('Exporting births...')
cur.execute('''
    SELECT ed.p_id, vd.y, vd.m, vd.d
    FROM EventDetails ed
    JOIN Events e ON e.id=ed.e_id AND e.et_id=1
    JOIN ValuesDates vd ON vd.rec_id=e.id AND vd.rec_table=7 AND vd.f_id=29
    WHERE ed.er_id=1
''')
births = {r[0]: [r[1], r[2], r[3]] for r in cur.fetchall()}
save('births', births)

# ── Death dates ───────────────────────────────────────────────
# {person_id: [y, m, d]}
print('Exporting deaths...')
cur.execute('''
    SELECT ed.p_id, vd.y, vd.m, vd.d
    FROM EventDetails ed
    JOIN Events e ON e.id=ed.e_id AND e.et_id=2
    JOIN ValuesDates vd ON vd.rec_id=e.id AND vd.rec_table=7 AND vd.f_id=29
    WHERE ed.er_id=4
''')
deaths = {r[0]: [r[1], r[2], r[3]] for r in cur.fetchall()}
save('deaths', deaths)

conn.close()
print('\nAll done.')
