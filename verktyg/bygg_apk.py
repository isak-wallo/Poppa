"""Bygger Poppa som Android-app (APK) med Capacitor.

Bygget görs i en kopia utanför Dropbox (%LOCALAPPDATA%\\keiws-bygg\\poppa),
eftersom Dropbox låser filerna och gör om dem till molnfiler mitt i bygget.
Dit kopieras Android-projektet (android/, package.json, capacitor.config.json)
och appens filer (ASSETS i sw.js, utom sw.js) från arbetskopian. Sedan körs
`npx cap sync android` och Gradle, som signerar med keIWs nyckel (keiwsNycklar
i ~/.gradle/gradle.properties, utanför repot).

APK:n hamnar i Claude\\apk\\Poppa-vNN.apk (i Dropbox, så att den kan öppnas på
plattan); den förra tas bort. versionCode är numret i VERSION i sw.js
(v33 -> 33), så en ny APK installeras över den gamla.

    python verktyg/bygg_apk.py               # bygger APK:n
    python verktyg/bygg_apk.py --installera  # och installerar den med adb (USB)

Kräver Node, Java 21 och Android SDK (ANDROID_HOME, annars
%LOCALAPPDATA%\\Android\\Sdk).
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BYGG = os.path.join(os.environ['LOCALAPPDATA'], 'keiws-bygg', 'poppa')
UT = os.path.join(os.path.dirname(ROT), 'apk')
SDK = os.environ.get('ANDROID_HOME') or os.path.join(os.environ['LOCALAPPDATA'], 'Android', 'Sdk')
# Det som Capacitor och Gradle gör själva kopieras inte.
GENERERAT = shutil.ignore_patterns('build', '.gradle', 'capacitor-cordova-android-plugins', 'public',
                                   'capacitor.config.json', 'capacitor.plugins.json', 'local.properties')


def kor(kommando, cwd=BYGG):
    subprocess.run(kommando, shell=True, cwd=cwd, check=True,
                   env={**os.environ, 'ANDROID_HOME': SDK})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--installera', action='store_true')
    arg = ap.parse_args()

    sw = open(os.path.join(ROT, 'sw.js'), encoding='utf-8').read()
    version = re.search(r"const VERSION = '([^']*)'", sw).group(1)
    nr = int(re.search(r'\d+', version).group(0))
    assets = re.findall(r"'\./([^']*)'", re.search(r'const ASSETS = \[(.*?)\];', sw, re.S).group(1))

    # Android-projektets källor kopieras på nytt (byggmapparna får vara kvar).
    os.makedirs(BYGG, exist_ok=True)
    shutil.rmtree(os.path.join(BYGG, 'android', 'app', 'src'), ignore_errors=True)
    shutil.copytree(os.path.join(ROT, 'android'), os.path.join(BYGG, 'android'), ignore=GENERERAT,
                    dirs_exist_ok=True)
    nytt_lock = False
    for fil in ['package.json', 'package-lock.json', 'capacitor.config.json']:
        mal = os.path.join(BYGG, fil)
        data = open(os.path.join(ROT, fil), 'rb').read()
        if fil == 'package-lock.json':
            nytt_lock = not os.path.exists(mal) or open(mal, 'rb').read() != data
        open(mal, 'wb').write(data)
    if nytt_lock or not os.path.isdir(os.path.join(BYGG, 'node_modules')):
        kor('npm ci --no-audit --no-fund')

    webb = os.path.join(BYGG, 'app-webb')
    shutil.rmtree(webb, ignore_errors=True)
    for fil in [f for f in assets if f]:
        mal = os.path.join(webb, fil)
        os.makedirs(os.path.dirname(mal), exist_ok=True)
        shutil.copyfile(os.path.join(ROT, fil), mal)

    kor('npx cap sync android')
    kor(os.path.join(BYGG, 'android', 'gradlew.bat') + ' assembleRelease -q -PversionCode=%d -PversionName=%s'
        % (nr, version), cwd=os.path.join(BYGG, 'android'))

    os.makedirs(UT, exist_ok=True)
    for gammal in glob.glob(os.path.join(UT, 'Poppa-*.apk')):
        os.remove(gammal)
    apk = os.path.join(UT, 'Poppa-%s.apk' % version)
    shutil.copyfile(os.path.join(BYGG, 'android', 'app', 'build', 'outputs', 'apk', 'release',
                                 'app-release.apk'), apk)
    print('Klar:', apk)
    if arg.installera:
        kor('"%s" install -r "%s"' % (os.path.join(SDK, 'platform-tools', 'adb.exe'), apk))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
