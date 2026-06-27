#!/bin/bash

FONT="/tmp/fonts/NotoSansJP-Bold.ttf"
OUT_BASE="android/app/src/main/res"

make_full_icon() {
  local size=$1
  local out=$2
  local font_size=$3
  magick -size ${size}x${size} \
    gradient:"#4A1D96-#7C3AED" \
    -font "$FONT" \
    -pointsize $font_size \
    -fill white \
    -gravity Center \
    -annotate 0 "空" \
    "$out"
}

make_round_icon() {
  local size=$1
  local out=$2
  local font_size=$3
  local half=$((size/2))
  magick -size ${size}x${size} \
    gradient:"#4A1D96-#7C3AED" \
    \( +clone -alpha extract \
       -fill black -draw "rectangle 0,0 ${size},${size}" \
       -fill white -draw "circle ${half},${half} ${half},0" \
    \) -alpha off -compose CopyOpacity -composite \
    -font "$FONT" \
    -pointsize $font_size \
    -fill white \
    -gravity Center \
    -annotate 0 "空" \
    "$out"
}

make_foreground() {
  local size=$1
  local out=$2
  local font_size=$3
  magick -size ${size}x${size} xc:none \
    -font "$FONT" \
    -pointsize $font_size \
    -fill white \
    -gravity Center \
    -annotate 0 "空" \
    "$out"
}

make_background() {
  local size=$1
  local out=$2
  magick -size ${size}x${size} \
    gradient:"#4A1D96-#7C3AED" \
    "$out"
}

make_monochrome() {
  local size=$1
  local out=$2
  local font_size=$3
  magick -size ${size}x${size} xc:none \
    -font "$FONT" \
    -pointsize $font_size \
    -fill white \
    -gravity Center \
    -annotate 0 "空" \
    "$out"
}

echo "Generating launcher icons..."

make_full_icon 48  "$OUT_BASE/mipmap-mdpi/ic_launcher.webp"     29; echo "  ✓ mdpi ic_launcher"
make_full_icon 72  "$OUT_BASE/mipmap-hdpi/ic_launcher.webp"     43; echo "  ✓ hdpi ic_launcher"
make_full_icon 96  "$OUT_BASE/mipmap-xhdpi/ic_launcher.webp"    57; echo "  ✓ xhdpi ic_launcher"
make_full_icon 144 "$OUT_BASE/mipmap-xxhdpi/ic_launcher.webp"   86; echo "  ✓ xxhdpi ic_launcher"
make_full_icon 192 "$OUT_BASE/mipmap-xxxhdpi/ic_launcher.webp" 115; echo "  ✓ xxxhdpi ic_launcher"

echo ""
echo "Generating round icons..."
make_round_icon 48  "$OUT_BASE/mipmap-mdpi/ic_launcher_round.webp"     29; echo "  ✓ mdpi round"
make_round_icon 72  "$OUT_BASE/mipmap-hdpi/ic_launcher_round.webp"     43; echo "  ✓ hdpi round"
make_round_icon 96  "$OUT_BASE/mipmap-xhdpi/ic_launcher_round.webp"    57; echo "  ✓ xhdpi round"
make_round_icon 144 "$OUT_BASE/mipmap-xxhdpi/ic_launcher_round.webp"   86; echo "  ✓ xxhdpi round"
make_round_icon 192 "$OUT_BASE/mipmap-xxxhdpi/ic_launcher_round.webp" 115; echo "  ✓ xxxhdpi round"

echo ""
echo "Generating adaptive foreground layers..."
make_foreground 108 "$OUT_BASE/mipmap-mdpi/ic_launcher_foreground.webp"     58; echo "  ✓ mdpi foreground"
make_foreground 162 "$OUT_BASE/mipmap-hdpi/ic_launcher_foreground.webp"     86; echo "  ✓ hdpi foreground"
make_foreground 216 "$OUT_BASE/mipmap-xhdpi/ic_launcher_foreground.webp"   115; echo "  ✓ xhdpi foreground"
make_foreground 324 "$OUT_BASE/mipmap-xxhdpi/ic_launcher_foreground.webp"  172; echo "  ✓ xxhdpi foreground"
make_foreground 432 "$OUT_BASE/mipmap-xxxhdpi/ic_launcher_foreground.webp" 230; echo "  ✓ xxxhdpi foreground"

echo ""
echo "Generating adaptive background layers..."
make_background 108 "$OUT_BASE/mipmap-mdpi/ic_launcher_background.webp";     echo "  ✓ mdpi background"
make_background 162 "$OUT_BASE/mipmap-hdpi/ic_launcher_background.webp";     echo "  ✓ hdpi background"
make_background 216 "$OUT_BASE/mipmap-xhdpi/ic_launcher_background.webp";    echo "  ✓ xhdpi background"
make_background 324 "$OUT_BASE/mipmap-xxhdpi/ic_launcher_background.webp";   echo "  ✓ xxhdpi background"
make_background 432 "$OUT_BASE/mipmap-xxxhdpi/ic_launcher_background.webp";  echo "  ✓ xxxhdpi background"

echo ""
echo "Generating monochrome icons..."
make_monochrome 48  "$OUT_BASE/mipmap-mdpi/ic_launcher_monochrome.png"     29; echo "  ✓ mdpi monochrome"
make_monochrome 72  "$OUT_BASE/mipmap-hdpi/ic_launcher_monochrome.png"     43; echo "  ✓ hdpi monochrome"
make_monochrome 96  "$OUT_BASE/mipmap-xhdpi/ic_launcher_monochrome.png"    57; echo "  ✓ xhdpi monochrome"
make_monochrome 144 "$OUT_BASE/mipmap-xxhdpi/ic_launcher_monochrome.png"   86; echo "  ✓ xxhdpi monochrome"
make_monochrome 192 "$OUT_BASE/mipmap-xxxhdpi/ic_launcher_monochrome.png" 115; echo "  ✓ xxxhdpi monochrome"

echo ""
echo "All icons generated!"
