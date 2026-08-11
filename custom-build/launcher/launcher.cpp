// Native Windows launcher for the portable Custom Mixxx build.
// Does exactly what run-mixxx.bat did, but as a real .exe (no console flash):
//  - creates the local config dir
//  - if stem-tools\ is present: sets MIXXX_STEM_TOOLS / HF_HOME / HF_HUB_OFFLINE
//    and repoints the bundled venv's pyvenv.cfg to the bundled python-base
//  - launches app\mixxx.exe with forward-slash --settingsPath/--resourcePath
//    (backslashes get eaten by some skins' SVG templating -> blank buttons)
#ifndef UNICODE
#define UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <string>

static std::wstring exeDir() {
    wchar_t buf[MAX_PATH];
    DWORD n = GetModuleFileNameW(NULL, buf, MAX_PATH);
    std::wstring p(buf, n);
    size_t s = p.find_last_of(L"\\/");
    return (s == std::wstring::npos) ? L"" : p.substr(0, s + 1);
}

static bool fileExists(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static std::wstring toFwd(std::wstring s) {
    for (auto& c : s) {
        if (c == L'\\') {
            c = L'/';
        }
    }
    return s;
}

static void writeUtf8(const std::wstring& path, const std::wstring& content) {
    int len = WideCharToMultiByte(CP_UTF8, 0, content.c_str(), -1, NULL, 0, NULL, NULL);
    if (len <= 1) {
        return;
    }
    std::string bytes(static_cast<size_t>(len - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, content.c_str(), -1, &bytes[0], len, NULL, NULL);
    HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, NULL,
            CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) {
        return;
    }
    DWORD written = 0;
    WriteFile(h, bytes.data(), static_cast<DWORD>(bytes.size()), &written, NULL);
    CloseHandle(h);
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int) {
    const std::wstring base = exeDir();

    CreateDirectoryW((base + L"config").c_str(), NULL);

    // Optional stem-tools bundle
    if (fileExists(base + L"stem-tools\\venv\\Scripts\\python.exe")) {
        const std::wstring tools = base + L"stem-tools";
        const std::wstring hfHome = base + L"stem-tools\\hf-cache";
        const std::wstring pybase = base + L"stem-tools\\python-base";
        SetEnvironmentVariableW(L"MIXXX_STEM_TOOLS", tools.c_str());
        SetEnvironmentVariableW(L"HF_HOME", hfHome.c_str());
        SetEnvironmentVariableW(L"HF_HUB_OFFLINE", L"1");
        const std::wstring cfg =
                L"home = " + pybase + L"\n" +
                L"include-system-site-packages = false\n" +
                L"version = 3.12.10\n" +
                L"executable = " + pybase + L"\\python.exe\n";
        writeUtf8(base + L"stem-tools\\venv\\pyvenv.cfg", cfg);
    }

    const std::wstring mixxx = base + L"app\\mixxx.exe";
    if (!fileExists(mixxx)) {
        MessageBoxW(NULL, (L"mixxx.exe nicht gefunden:\n" + mixxx).c_str(),
                L"Custom Mixxx", MB_ICONERROR);
        return 1;
    }

    std::wstring cmd = L"\"" + mixxx + L"\" --settingsPath \"" +
            toFwd(base) + L"config\" --resourcePath \"" + toFwd(base) + L"res\"";
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (argv) {
        for (int i = 1; i < argc; ++i) {
            cmd += L" \"";
            cmd += argv[i];
            cmd += L"\"";
        }
        LocalFree(argv);
    }

    STARTUPINFOW si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));
    std::wstring mutableCmd = cmd;
    if (!CreateProcessW(NULL, &mutableCmd[0], NULL, NULL, FALSE, 0, NULL,
                base.c_str(), &si, &pi)) {
        MessageBoxW(NULL, L"Konnte Mixxx nicht starten.",
                L"Custom Mixxx", MB_ICONERROR);
        return 1;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
