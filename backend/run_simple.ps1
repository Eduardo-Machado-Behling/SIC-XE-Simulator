curl.exe -X PUT "http://localhost:8080/project?name=foo&id=0&arch=sic-xe"
curl.exe -X POST "http://localhost:8080/project/load?id=0"       

$content = [string]::Join(
    "`n",
    (Get-Content ./samples/bin/simple.bin)
)

$body = @{
    filePath = "main.asm"
    content  = $content
} | ConvertTo-Json -Compress

$body | curl.exe -X PUT "http://localhost:8080/simulator/project/file" `
    -H "Content-Type: application/json" `
    --data-binary "@-"
