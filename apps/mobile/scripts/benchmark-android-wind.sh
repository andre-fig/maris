#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:-com.maris.navigation}"
DURATION="${2:-300}"
OUT="${3:-artifacts/android-wind-benchmark-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"

adb get-state >/dev/null
adb shell am force-stop "$PACKAGE"
adb shell am start -n "$PACKAGE/.MainActivity" --ez maris.wind.enabled true >/dev/null
sleep 10

echo "package=$PACKAGE duration_s=$DURATION" | tee "$OUT/metadata.txt"
adb shell dumpsys gfxinfo "$PACKAGE" reset >/dev/null || true
adb shell dumpsys batterystats --reset >/dev/null || true

end=$(( $(date +%s) + DURATION ))
while [ "$(date +%s)" -lt "$end" ]; do
  adb shell input swipe 220 700 900 700 1200 >/dev/null
  adb shell input swipe 900 700 220 700 1200 >/dev/null
  adb shell input swipe 550 950 550 300 1200 >/dev/null
  adb shell input swipe 550 300 550 950 1200 >/dev/null
  adb shell input keyevent 20 >/dev/null
  adb shell input keyevent 19 >/dev/null
done

adb shell dumpsys gfxinfo "$PACKAGE" framestats > "$OUT/gfxinfo-framestats.txt"
adb shell dumpsys gfxinfo "$PACKAGE" > "$OUT/gfxinfo.txt"
adb shell dumpsys meminfo "$PACKAGE" > "$OUT/meminfo.txt"
adb shell dumpsys cpuinfo "$PACKAGE" > "$OUT/cpuinfo.txt"
adb shell dumpsys SurfaceFlinger --latency-clear >/dev/null 2>&1 || true
adb shell dumpsys thermalservice > "$OUT/thermalservice.txt" || true
adb shell dumpsys batterystats "$PACKAGE" > "$OUT/batterystats.txt" || true

echo "Results saved in $OUT"
echo "Use gfxinfo framestats for presented-frame intervals; meminfo for RAM;"
echo "cpuinfo for CPU; thermalservice for temperature/throttling; batterystats for energy."
