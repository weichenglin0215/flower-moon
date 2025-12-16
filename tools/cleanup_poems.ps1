$path = "c:/3D_prj/VS_2022_prj/FlowerMoon_web/data/poems.js"
$content = Get-Content -Path $path -Raw -Encoding UTF8

# Remove prefix and suffix
$jsonStr = $content -replace "^const\s+POEMS\s*=\s*", "" -replace ";\s*$", ""

try {
    $poems = $jsonStr | ConvertFrom-Json
    
    $modifiedCount = 0
    foreach ($poem in $poems) {
        if ($poem.content -and $poem.line_ratings -and ($poem.line_ratings.Count -gt $poem.content.Count)) {
            $poem.line_ratings = $poem.line_ratings[0..($poem.content.Count - 1)]
            $modifiedCount++
        }
    }
    
    Write-Host "Cleaned up $modifiedCount poems."
    
    # Convert back to JSON
    $newJson = $poems | ConvertTo-Json -Depth 10
    
    # Add prefix
    $newContent = "const POEMS = $newJson;"
    
    Set-Content -Path $path -Value $newContent -Encoding UTF8
    Write-Host "Done."
}
catch {
    Write-Error $_
}
