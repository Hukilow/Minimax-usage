# Generates placeholder screenshots for the Marketplace README.
# Replace these with real screenshots of the running extension.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\make-screenshots.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\docs\screenshots'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# VS Code dark theme palette (approximate).
$bg          = [System.Drawing.Color]::FromArgb(255, 30, 30, 30)        # editor.background
$panel       = [System.Drawing.Color]::FromArgb(255, 37, 37, 38)        # panel.background
$sidebar     = [System.Drawing.Color]::FromArgb(255, 51, 51, 51)        # sideBar.background
$statusbar   = [System.Drawing.Color]::FromArgb(255, 0, 122, 204)        # statusBar.background (blue accent)
$barFg       = [System.Drawing.Color]::FromArgb(255, 0, 180, 100)        # green
$barFgWarn   = [System.Drawing.Color]::FromArgb(255, 220, 170, 30)       # amber
$barFgErr    = [System.Drawing.Color]::FromArgb(255, 220, 60, 60)        # red
$barBg       = [System.Drawing.Color]::FromArgb(255, 60, 60, 60)        # bar track
$fg          = [System.Drawing.Color]::FromArgb(255, 230, 230, 230)      # foreground
$fgMuted     = [System.Drawing.Color]::FromArgb(255, 160, 160, 160)      # descriptionForeground
$border      = [System.Drawing.Color]::FromArgb(255, 70, 70, 70)

$fontFamily  = 'Segoe UI'

function New-Picture([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($bg)
    return @{ bmp = $bmp; g = $g }
}

function Save-Picture($pic, [string]$name) {
    $pic.g.Dispose()
    $path = Join-Path $outDir $name
    $pic.bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $pic.bmp.Dispose()
    Write-Host "Wrote $path"
}

function Draw-Text($g, [string]$text, [float]$x, [float]$y, [System.Drawing.Color]$color, [float]$size = 14, [string]$style = 'Regular') {
    $brush = New-Object System.Drawing.SolidBrush($color)
    $font = New-Object System.Drawing.Font($fontFamily, $size, [System.Drawing.FontStyle]$style)
    $pt = New-Object System.Drawing.PointF($x, $y)
    $g.DrawString($text, $font, $brush, $pt)
    $font.Dispose()
    $brush.Dispose()
}

function Draw-FillRect($g, [float]$x, [float]$y, [float]$w, [float]$h, [System.Drawing.Color]$color) {
    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillRectangle($brush, $x, $y, $w, $h)
    $brush.Dispose()
}

function Draw-OutlineRect($g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$thickness, [System.Drawing.Color]$color) {
    $pen = New-Object System.Drawing.Pen($color, $thickness)
    $g.DrawRectangle($pen, $x, $y, $w, $h)
    $pen.Dispose()
}

function Draw-RoundedRect($g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$radius, [System.Drawing.Color]$color) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $radius, $radius, 180, 90)
    $path.AddArc($x + $w - $radius, $y, $radius, $radius, 270, 90)
    $path.AddArc($x + $w - $radius, $y + $h - $radius, $radius, $radius, 0, 90)
    $path.AddArc($x, $y + $h - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()
    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
}

# -----------------------------------------------------------------------------
# 1. status-bar.png  (1200 x 200) — just the status bar.
# -----------------------------------------------------------------------------
$pic = New-Picture 1200 200
$g = $pic.g

# Top "window chrome" strip (file tabs).
Draw-FillRect $g 0 0 1200 36 $sidebar
Draw-Text $g 'README.md  —  MiniMax Usage' 16 9 $fg 13 'Regular'
Draw-Text $g 'src/extension.ts  src/api/quota.ts' 360 9 $fgMuted 13 'Regular'

# Status bar across the bottom (blue accent).
$sbY = 156
Draw-FillRect $g 0 $sbY 1200 44 $statusbar

# Left side: usual VS Code items.
$leftY = $sbY + 12
Draw-Text $g 'main+' 16 $leftY $fg 13
Draw-Text $g 'UTF-8  LF  TypeScript' 90 $leftY $fg 13

# Right side: our two MiniMax Usage panels (5h + Wk).
# Panel 1: 5h — 78% used (yellow)
$p1x = 720
$p1y = $sbY + 10
$p1w = 200
$p1h = 24
Draw-FillRect $g $p1x $p1y $p1w $p1h $barBg
$used1 = 0.78
Draw-FillRect $g $p1x $p1y ($p1w * $used1) $p1h $barFgWarn
Draw-Text $g '5h  ●●●●○  78%' ($p1x + 8) ($p1y + 4) $fg 13 'Bold'

# Panel 2: Wk — 31% used (green)
$p2x = 940
$p2y = $sbY + 10
$p2w = 200
$p2h = 24
Draw-FillRect $g $p2x $p2y $p2w $p2h $barBg
$used2 = 0.31
Draw-FillRect $g $p2x $p2y ($p2w * $used2) $p2h $barFg
Draw-Text $g 'Wk  ●●○○○  31%' ($p2x + 8) ($p2y + 4) $fg 13 'Bold'

# Editor area (placeholder).
Draw-Text $g 'Editor area (placeholder)' 16 60 $fgMuted 14

Save-Picture $pic 'status-bar.png'

# -----------------------------------------------------------------------------
# 2. sidebar.png  (480 x 640) — Activity Bar + Side Bar + editor strip.
# -----------------------------------------------------------------------------
$pic = New-Picture 480 640
$g = $pic.g

# Activity bar (icon strip on the very left).
Draw-FillRect $g 0 0 48 640 $sidebar
# Icon placeholders (squares).
for ($i = 0; $i -lt 7; $i++) {
    $y = 14 + $i * 64
    Draw-RoundedRect $g 12 $y 24 24 4 $fgMuted
}
# Highlight the MiniMax Usage icon (pulse-shape).
$mmIconY = 14 + (4 * 64)
$mmIconLabelY = 76 + (4 * 64)
Draw-RoundedRect $g 12 $mmIconY 24 24 4 $barFg
Draw-Text $g '~' 18 $mmIconLabelY $fg 14 'Bold'

# Side bar.
Draw-FillRect $g 48 0 432 640 $panel
Draw-Text $g 'MINIMAX USAGE' 64 16 $fgMuted 11 'Bold'

# Sections and items.
function Draw-TreeItem($g, [float]$y, [string]$label, [string]$detail, [int]$indent, [System.Drawing.Color]$dotColor) {
    Draw-RoundedRect $g (16 + 56 + $indent * 12) ($y + 4) 6 6 3 $dotColor
    Draw-Text $g $label (16 + 56 + $indent * 12 + 14) $y $fg 13
    Draw-Text $g $detail 350 $y $fgMuted 12
}

Draw-Text $g 'general' 64 50 $fg 13 'Bold'
Draw-Text $g '5h  78%  •  Wk  31%' 64 70 $fgMuted 12

Draw-TreeItem $g 100 '5-hour' '78% · resets in 1h 5m' 1 $barFgWarn
Draw-TreeItem $g 128 'Weekly' '31% · resets in 4d 11h' 1 $barFg

Draw-Text $g 'video' 64 168 $fg 13 'Bold'
Draw-Text $g '5h  20%  •  Wk  12%' 64 188 $fgMuted 12

Draw-TreeItem $g 218 '5-hour' '20% · resets in 3h 47m' 1 $barFg
Draw-TreeItem $g 246 'Weekly' '12% · resets in 5d 3h'  1 $barFg

# Hint at the bottom.
Draw-Text $g 'Refresh · Open Dashboard · Open Billing' 64 600 $fgMuted 12

Save-Picture $pic 'sidebar.png'

# -----------------------------------------------------------------------------
# 3. dashboard.png  (1200 x 760) — full dashboard webview.
# -----------------------------------------------------------------------------
$pic = New-Picture 1200 760
$g = $pic.g

# Top bar.
Draw-FillRect $g 0 0 1200 60 $sidebar
Draw-Text $g 'MiniMax Usage' 24 18 $fg 18 'Bold'
# Buttons (right).
$bx = 800
for ($i = 0; $i -lt 3; $i++) {
    Draw-RoundedRect $g ($bx + $i * 130) 18 116 28 4 $panel
    Draw-OutlineRect $g ($bx + $i * 130) 18 116 28 4 $border
    $label = @('Refresh', 'Open Billing', 'Set API Key')[$i]
    Draw-Text $g $label ($bx + $i * 130 + 14) 22 $fg 13
}

# Per-model cards.
$cardY = 90
$cardW = 560
$cardH = 140
function Draw-Card($g, [float]$x, [float]$y, [string]$model, [int]$usedInt, [int]$remainingInt, [System.Drawing.Color]$barColor, [string]$resetLabel) {
    Draw-RoundedRect $g $x $y $cardW $cardH 8 $panel
    Draw-OutlineRect $g $x $y $cardW $cardH 1 $border
    Draw-Text $g $model ($x + 16) ($y + 12) $fg 16 'Bold'
    Draw-Text $g "Used: ${usedInt}%   (${remainingInt}% remaining)" ($x + 16) ($y + 36) $fgMuted 12

    # 5h bar.
    $bx = $x + 16
    $bw = $cardW - 32
    $by = $y + 72
    Draw-FillRect $g $bx $by $bw 18 $barBg
    Draw-FillRect $g $bx $by ($bw * ($usedInt / 100.0)) 18 $barColor
    Draw-Text $g "5h  ${usedInt}% used  ·  resets in ${resetLabel}" ($bx + 8) ($by + 2) $fg 12 'Bold'

    # Wk bar.
    $by2 = $y + 100
    Draw-FillRect $g $bx $by2 $bw 18 $barBg
    Draw-FillRect $g $bx $by2 ($bw * ($usedInt / 100.0 * 0.4)) 18 $barFg
    Draw-Text $g 'Wk  12% used  ·  resets in 5d 3h' ($bx + 8) ($by2 + 2) $fg 12 'Bold'
}

Draw-Card $g 24  $cardY 'general' 78 22 $barFgWarn '1h 5m'
Draw-Card $g 616 $cardY 'video'   20 80 $barFg     '3h 47m'

# History section.
$hY = 260
Draw-Text $g 'History' 24 $hY $fg 18 'Bold'

function Draw-Chart($g, [float]$x, [float]$y, [float]$w, [float]$h, [string]$title, [System.Drawing.Color]$lineColor, [double[]]$points) {
    # Background.
    Draw-RoundedRect $g $x $y $w $h 6 $panel
    Draw-OutlineRect $g $x $y $w $h 1 $border
    Draw-Text $g $title ($x + 12) ($y + 8) $fg 13 'Bold'

    # Plot area.
    $pL = $x + 48
    $pR = $x + $w - 16
    $pT = $y + 36
    $pB = $y + $h - 28
    $pW = $pR - $pL
    $pH = $pB - $pT

    # Grid lines.
    for ($i = 0; $i -le 4; $i++) {
        $gy = $pT + ($pH / 4) * $i
        Draw-FillRect $g $pL $gy $pW 1 ([System.Drawing.Color]::FromArgb(60, 127, 127, 127))
    }

    # Y axis labels.
    for ($i = 0; $i -le 4; $i++) {
        $val = 100 - ($i * 25)
        $gy = $pT + ($pH / 4) * $i
        Draw-Text $g "${val}%" ($pL - 36) ($gy - 6) $fgMuted 10
    }

    # Line.
    $n = $points.Length
    if ($n -lt 2) { return }
    $pen = New-Object System.Drawing.Pen($lineColor, 2.0)
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $prev = $null
    for ($i = 0; $i -lt $n; $i++) {
        $px = $pL + ($pW / ($n - 1)) * $i
        $py = $pB - ([Math]::Max(0, [Math]::Min(100, $points[$i])) / 100.0) * $pH
        if ($null -ne $prev) {
            $g.DrawLine($pen, $prev[0], $prev[1], $px, $py)
        }
        $prev = @($px, $py)
    }
    $pen.Dispose()
}

# Sample historical points (used %).
$pointsInterval = @(0, 5, 14, 22, 31, 40, 51, 60, 71, 78)
$pointsWeekly   = @(0, 3, 8, 14, 19, 22, 26, 28, 30, 31)

Draw-Chart $g 24  300 1152 200 '5-hour window (% used)' $barFgWarn $pointsInterval
Draw-Chart $g 24  520 1152 200 'Weekly window (% used)' $barFg     $pointsWeekly

# Footer hint.
Draw-Text $g 'Region: Global  ·  Last fetch: just now' 24 730 $fgMuted 12

Save-Picture $pic 'dashboard.png'

# -----------------------------------------------------------------------------
# 4. settings.png  (1100 x 700) — settings tab mock.
# -----------------------------------------------------------------------------
$pic = New-Picture 1100 700
$g = $pic.g

# Sidebar.
Draw-FillRect $g 0 0 280 700 $sidebar
Draw-Text $g 'Settings' 16 16 $fg 16 'Bold'

$items = @(
    'Commonly Used',
    'Extensions',
    'Editor',
    'Workbench',
    'Terminal',
    'Source Control',
    'MiniMax Usage'
)
$iy = 60
for ($i = 0; $i -lt $items.Length; $i++) {
    if ($items[$i] -eq 'MiniMax Usage') {
        Draw-FillRect $g 0 ($iy + $i * 30) 280 28 ([System.Drawing.Color]::FromArgb(255, 70, 70, 70))
    }
    Draw-Text $g $items[$i] 24 ($iy + $i * 30 + 6) $fg 13
}

# Main settings pane.
Draw-FillRect $g 280 0 820 700 $bg
Draw-Text $g 'MiniMax Usage' 312 24 $fg 20 'Bold'
Draw-Text $g 'Settings for the MiniMax Token Plan quota extension.' 312 52 $fgMuted 12

# Setting rows.
$rows = @(
    @{ label = 'MiniMax Usage: Refresh Interval (seconds)'; value = '60'; desc = 'How often to poll the MiniMax Token Plan API.' }
    @{ label = 'MiniMax Usage: Status Bar Display Mode'; value = 'compact'; desc = 'compact = two panels, split = inline countdown.' }
    @{ label = 'MiniMax Usage: Warning Threshold'; value = '70'; desc = 'Used-% at which the status bar turns yellow.' }
    @{ label = 'MiniMax Usage: Error Threshold'; value = '90'; desc = 'Used-% at which the status bar turns red.' }
    @{ label = 'MiniMax Usage: History Sample Limit'; value = '100'; desc = 'Maximum samples to keep for the chart.' }
    @{ label = 'MiniMax Usage: Show Sidebar'; value = 'true (checkbox)'; desc = 'Show the MiniMax Usage view in the Activity Bar.' }
    @{ label = 'MiniMax Usage: Debug'; value = 'false (checkbox)'; desc = 'Verbose logs in Output channel.' }
)

$ry = 100
for ($i = 0; $i -lt $rows.Length; $i++) {
    $r = $rows[$i]
    Draw-Text $g $r.label 312 $ry $fg 14 'Bold'
    Draw-Text $g $r.desc  312 ($ry + 20) $fgMuted 12
    # Input box on the right.
    Draw-RoundedRect $g 870 ($ry - 4) 200 28 4 $panel
    Draw-OutlineRect $g 870 ($ry - 4) 200 28 1 $border
    Draw-Text $g $r.value 882 ($ry + 2) $fg 13
    $ry += 60
}

Save-Picture $pic 'settings.png'

Write-Host 'All screenshots regenerated.'
