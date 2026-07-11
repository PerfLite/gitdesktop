# Changelog

## v1.0.0 — Первый стабильный релиз

### Возможности

- GitHub OAuth Device Flow авторизация
- Просмотр, создание, удаление репозиториев
- Локальные git-операции: clone, commit, push, pull, fetch, branch, diff, history
- Отслеживание изменений файлов (file watcher)
- Автообновление через GitHub Releases

### Исправления

- Исправлен бесконечный перезапуск (crash loop) при автообновлении
- Сравнение путей через `filepath.EvalSymlinks` вместо `strings.HasPrefix`
- Защита от зацикливания: счётчик перезапусков через `GITDESKTOP_RESTART_COUNT`
