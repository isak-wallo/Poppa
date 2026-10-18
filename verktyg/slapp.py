"""Släpper Poppa på poppa.keiws.com.

GitHub Pages (https://isak-wallo.github.io/Poppa/) uppdateras vid varje push,
som förut. poppa.keiws.com byts bara när det här skriptet körs med --skarpt.
Skriptet tar appens filer (ASSETS i sw.js, plus sw.js) från den pushade koden
(origin/main), inte från arbetskopian. Den skarpa sidan har egna versionsnummer:
i den släppta sw.js byts VERSION mot släppnumret (v1, v2 ...), så installerade
appar hämtar den nya versionen. Varje släpp märks med en tagg i git (slapp-1,
slapp-2 ...).

    python verktyg/slapp.py            # visar vad som är släppt och vad som är nytt
    python verktyg/slapp.py --skarpt   # släpper origin/main

Kräver Node och att man loggat in en gång med `npx wrangler login`.
"""
import os
import re
import shutil
import subprocess
import sys

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBB = os.path.join(ROT, 'webb')


def git(*arg):
    return subprocess.run(['git', *arg], cwd=ROT, check=True, capture_output=True,
                          text=True, encoding='utf-8').stdout.strip()


def slapp():
    """Senaste släppet: (nummer, tagg), eller (0, None) om inget släppts."""
    alla = [(int(m[1]), t) for t in git('tag', '--list', 'slapp-*').split()
            if (m := re.fullmatch(r'slapp-(\d+)', t))]
    return max(alla) if alla else (0, None)


def version(ref):
    return re.search(r"const VERSION = '([^']*)'", git('show', ref + ':sw.js')).group(1)


def status():
    git('fetch', '-q', '--tags', 'origin')
    nr, tagg = slapp()
    print('GitHub Pages:', version('origin/main'))
    if not tagg:
        print('poppa.keiws.com: inget släppt än')
        return
    print('poppa.keiws.com: v%d (%s från %s)' % (nr, tagg, version(tagg)))
    print('Nytt sedan dess:\n' + (git('log', '--oneline', tagg + '..origin/main') or '  inget'))


def bygg(nr):
    """webb/ med appens filer från origin/main och VERSION = vNR."""
    shutil.rmtree(WEBB, ignore_errors=True)
    sw = git('show', 'origin/main:sw.js')
    assets = re.findall(r"'\./([^']*)'", re.search(r'const ASSETS = \[(.*?)\];', sw, re.S).group(1))
    for fil in [f for f in assets if f] + ['sw.js']:
        mal = os.path.join(WEBB, fil)
        os.makedirs(os.path.dirname(mal), exist_ok=True)
        data = subprocess.run(['git', 'show', 'origin/main:' + fil], cwd=ROT, check=True,
                              capture_output=True).stdout
        if fil == 'sw.js':
            data = re.sub(rb"const VERSION = '[^']*'", b"const VERSION = 'v%d'" % nr, data, count=1)
        with open(mal, 'wb') as f:
            f.write(data)


def skarpt():
    git('fetch', '-q', '--tags', 'origin')
    if git('rev-parse', 'HEAD') != git('rev-parse', 'origin/main') or git('status', '--porcelain', '--untracked-files=no'):
        sys.exit('Arbetskopian ska vara lika med origin/main (pusha eller hämta först).')
    nr = slapp()[0] + 1
    bygg(nr)
    try:
        subprocess.run('npx -y wrangler@4 deploy', shell=True, cwd=ROT, check=True)
    finally:
        shutil.rmtree(WEBB, ignore_errors=True)
    tagg = 'slapp-%d' % nr
    git('tag', '-a', tagg, 'origin/main', '-m', 'Släpp v%d på poppa.keiws.com (från %s)' % (nr, version('origin/main')))
    git('push', '-q', 'origin', tagg)
    print('Släppt: v%d på https://poppa.keiws.com (%s, från %s)' % (nr, tagg, version('origin/main')))


if __name__ == '__main__':
    skarpt() if '--skarpt' in sys.argv else status()
