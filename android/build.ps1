param(
    [string]$Sdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }),
    [string]$Jdk = $(if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:/Program Files/Android/Android Studio/jbr' })
)

$ErrorActionPreference = 'Stop'
$toolDir = Join-Path $Sdk 'build-tools/35.0.0'
$androidJar = Join-Path $Sdk 'platforms/android-34/android.jar'
$sourceDir = Join-Path $PSScriptRoot 'app/src/main'
$outputDir = Join-Path $PSScriptRoot 'build'
$classes = Join-Path $outputDir 'classes'
$env:JAVA_HOME = $Jdk
New-Item -ItemType Directory -Force -Path $classes | Out-Null

function Invoke-AndroidTool([string]$Path, [string[]]$Arguments) {
    & $Path @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Build tool failed ($LASTEXITCODE): $Path" }
}

$resources = Join-Path $outputDir 'resources.zip'
$unsigned = Join-Path $outputDir 'unsigned.apk'
$aligned = Join-Path $outputDir 'aligned.apk'
$apk = Join-Path $outputDir 'mawadda-android-debug.apk'
$key = Join-Path $outputDir 'debug.keystore'
$javaSource = Join-Path $sourceDir 'java/app/mawadda/android/MainActivity.java'

Invoke-AndroidTool "$toolDir/aapt2.exe" @('compile', '--dir', "$sourceDir/res", '-o', $resources)
Invoke-AndroidTool "$toolDir/aapt2.exe" @('link', '-I', $androidJar, '--manifest', "$sourceDir/AndroidManifest.xml", '-o', $unsigned, $resources)
Invoke-AndroidTool "$Jdk/bin/javac.exe" @('-encoding', 'UTF-8', '--release', '8', '-classpath', $androidJar, '-d', $classes, $javaSource)
$bytecode = @(Get-ChildItem -LiteralPath $classes -Recurse -File -Filter '*.class' | ForEach-Object FullName)
Invoke-AndroidTool "$toolDir/d8.bat" (@('--lib', $androidJar, '--min-api', '26', '--output', $outputDir) + $bytecode)
Invoke-AndroidTool "$Jdk/bin/jar.exe" @('uf', $unsigned, '-C', $outputDir, 'classes.dex')
Invoke-AndroidTool "$toolDir/zipalign.exe" @('-f', '4', $unsigned, $aligned)
if (!(Test-Path -LiteralPath $key)) {
    Invoke-AndroidTool "$Jdk/bin/keytool.exe" @('-genkeypair', '-keystore', $key, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Mawadda Debug')
}
Invoke-AndroidTool "$toolDir/apksigner.bat" @('sign', '--ks', $key, '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $apk, $aligned)
Invoke-AndroidTool "$toolDir/apksigner.bat" @('verify', '--verbose', $apk)
Write-Output $apk
