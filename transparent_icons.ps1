[Reflection.Assembly]::LoadWithPartialName("System.Drawing")
$files = @("icon16.png", "icon32.png", "icon48.png", "icon128.png")

for ($i = 0; $i -lt $files.Length; $i++) {
    $file = "icons\" + $files[$i]
    if ([System.IO.File]::Exists($file)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
        $img = [System.Drawing.Image]::FromStream($ms)
        $bmp = new-object System.Drawing.Bitmap($img)
        
        # Assume top-left pixel is the background color
        $bgColor = $bmp.GetPixel(0, 0)
        $bmp.MakeTransparent($bgColor)
        
        $bmp.Save($file + "_temp", [System.Drawing.Imaging.ImageFormat]::Png)
        $ms.Close()
        $img.Dispose()
        $bmp.Dispose()
        Remove-Item $file -Force
        Rename-Item ($file + "_temp") $files[$i]
        Write-Host "Made background transparent for $file"
    } else {
        Write-Host "File $file not found."
    }
}
