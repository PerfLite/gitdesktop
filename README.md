# GitDesktop

Лёгкий кроссплатформенный десктоп-клиент для GitHub (Windows/Linux), написанный с помощью [Wails](https://wails.io/) (Go-бэкенд + веб-фронтенд на чистом JavaScript). Цель проекта — дать простой локальный интерфейс для повседневной работы с репозиториями GitHub и git без необходимости лезть в консоль.

## Возможности

- Просмотр и управление репозиториями GitHub (через OAuth device flow).
- Локальные git-операции: статус изменений, история коммитов, дерево файлов, README.
- Клонирование и создание репозиториев.
- Поддержка веток: создание, переключение, pull, push, stash.
- Интеграция с GitHub: работа с Pull Request'ами.
- Удобный интерфейс разрешения merge-конфликтов.
- Поддержка светлой и тёмной тем.
- Автоматическое обновление из GitHub Releases для Windows (.exe) и Linux (AppImage, .deb).

## Требования

- **Windows**: Windows 10/11 с установленным `git`.
- **Linux**: Для запуска `.deb` и `.AppImage` необходима системная библиотека `libwebkit2gtk-4.1-0` и `git`:

```bash
sudo apt install libwebkit2gtk-4.1-0 git
```

## Установка

### AppImage

Скачайте `gitdesktop-<версия>-x86_64.AppImage` из раздела Releases, сделайте исполняемым и запустите:

```bash
chmod +x gitdesktop-*.AppImage
./gitdesktop-*.AppImage
```

### Debian / Ubuntu (.deb)

```bash
sudo apt install ./gitdesktop_<версия>_amd64.deb
```

### Из исходников

Требуется Go 1.21+ и установленный Wails:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails build
```

## Сборка релиза

```bash
make all       # собрать .deb и .AppImage (+ сырой бинарник)
make release   # опубликовать артефакты в GitHub Releases (нужен `gh auth login`)
```

## Автообновление

При запуске приложение сверяет свою версию (из `VERSION`) с последним тегом релиза на GitHub. Если доступна более новая версия, она скачивается и устанавливается автоматически, плавно заменяя исполняемый файл приложения (в том числе на Windows, перезаписывая .exe).

## Лицензия

Распространяется под лицензией **GPL-3.0**. См. файл [LICENSE](LICENSE).
