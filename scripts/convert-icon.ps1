# Converts media/icon.jpg -> media/icon.png (128x128) for the VS Code webview
# icon. Keeps the user's new logo (no regeneration of the artwork).
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/convert-icon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$mediaDir = Join-Path $PSScriptRoot '..\media'
$src = Join-Path $mediaDir 'icon.jpg'
$dst = Join-Path $mediaDir 'icon.png'

if (-not (Test-Path $src)) {
    Write-Error "Source not found: $src"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($src)
try {
    # Crop to a centered square (1:1) then resize to 128x128.
    $w = $srcImg.Width
    $h = $srcImg.Height
    $side = [Math]::Min($w, $h)
    $x = [Math]::Floor(($w - $side) / 2)
    $y = [Math]::Floor(($h - $side) / 2)
    $srcRect = New-Object System.Drawing.Rectangle($x, $y, $side, $side)

    $target = 128
    $dstBmp = New-Object System.Drawing.Bitmap($target, $target)
    try {
        $g = [System.Drawing.Graphics]::FromImage($dstBmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.DrawImage($srcImg, (New-Object System.Drawing.Rectangle(0, 0, $target, $target)), $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        } finally {
            $g.Dispose()
        }
        $dstBmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $dstBmp.Dispose()
    }
} finally {
    $srcImg.Dispose()
}

Write-Host "Converted $src -> $dst ($target x $target PNG)"
