[Reflection.Assembly]::LoadWithPartialName("System.Drawing")
$files = @("icon16.png", "icon32.png", "icon48.png", "icon128.png")
$sizes = @(16, 32, 48, 128)

for ($i = 0; $i -lt $files.Length; $i++) {
    $size = $sizes[$i]
    $file = "icons\" + $files[$i]
    if ([System.IO.File]::Exists($file)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
        $img = [System.Drawing.Image]::FromStream($ms)
        $bmp = new-object System.Drawing.Bitmap($img, $size, $size)
        $bmp.Save($file + "_temp", [System.Drawing.Imaging.ImageFormat]::Png)
        $ms.Close()
        $img.Dispose()
        $bmp.Dispose()
        Remove-Item $file -Force
        Rename-Item ($file + "_temp") $files[$i]
        Write-Host "Resized $file to $size x $size"
    } else {
        Write-Host "File $file not found."
    }
}
