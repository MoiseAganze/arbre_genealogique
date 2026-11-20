#!/usr/bin/env python3
"""Fabrique dist/arbre_famille-cpanel.zip : seulement les fichiers utiles en ligne
(sans install.php, node_modules, sources CSS, config locale ni photos)."""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'arbre_famille-cpanel.zip')
EXCLUDE_DIRS = {'node_modules', '.claude', 'dist', 'src', '.git', 'tools'}
EXCLUDE_FILES = {'install.php', 'package.json', 'package-lock.json', '.gitignore',
                 'app/config.php', 'database/schema.sql', 'database/demo.php'}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
count = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT)
        top = rel.split(os.sep)[0]
        if rel != '.' and top in EXCLUDE_DIRS:
            dirs[:] = []
            continue
        for f in files:
            path = f if rel == '.' else os.path.join(rel, f).replace(os.sep, '/')
            if path in EXCLUDE_FILES or (path.startswith('uploads/') and f != '.htaccess'):
                continue
            z.write(os.path.join(d, f), 'arbre_famille/' + path)
            count += 1
print(f'{OUT} — {count} fichiers')
