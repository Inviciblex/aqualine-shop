# Git flow — модель ветвления

Проект разрабатывается по классической модели **git flow**. Прод обновляется
**только релизным тегом** `vX.Y.Z` (см. [.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

## Постоянные ветки

| Ветка     | Назначение                                                        |
|-----------|-------------------------------------------------------------------|
| `main`    | Боевой код. Сюда попадают только релизы и хотфиксы. Каждое слияние тегируется `vX.Y.Z`. |
| `develop` | Интеграционная ветка. Сюда вливаются все завершённые фичи. «Следующий релиз». |

`main` и `develop` живут постоянно. Прямые коммиты в них запрещены — только через merge.

## Временные ветки

| Префикс     | От чего      | Куда вливается           | Зачем                       |
|-------------|--------------|--------------------------|-----------------------------|
| `feature/*` | `develop`    | `develop`                | Новая функциональность      |
| `release/*` | `develop`    | `main` **и** `develop`   | Подготовка релиза           |
| `hotfix/*`  | `main`       | `main` **и** `develop`   | Срочное исправление прода    |

## Рабочие сценарии

### Новая фича
```bash
git checkout develop && git pull
git checkout -b feature/корзина-скидки
# ...работа, коммиты...
git push -u origin feature/корзина-скидки
# → открыть Pull Request в develop (CI прогонит сборку)
```

### Релиз (выкатка на прод)
```bash
git checkout develop && git pull
git checkout -b release/1.2.0
# поднять версию в package.json и server/package.json, финальные правки
git checkout main && git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "Release 1.2.0"      # ← ЭТОТ тег запускает деплой на прод
git push origin main --tags
# влить обратно в develop, чтобы не потерять правки релиза:
git checkout develop && git merge --no-ff release/1.2.0
git push origin develop
git branch -d release/1.2.0
```

### Хотфикс (срочная починка прода)
```bash
git checkout main && git pull
git checkout -b hotfix/1.2.1
# ...починка...
git checkout main && git merge --no-ff hotfix/1.2.1
git tag -a v1.2.1 -m "Hotfix 1.2.1"        # ← деплой на прод
git push origin main --tags
git checkout develop && git merge --no-ff hotfix/1.2.1
git push origin develop
git branch -d hotfix/1.2.1
```

## Версии (SemVer)

Тег `vMAJOR.MINOR.PATCH`:
- **MAJOR** — несовместимые изменения,
- **MINOR** — новая функциональность с обратной совместимостью,
- **PATCH** — исправления (обычно хотфиксы).

## Что делает CI

- **Pull Request в `main`/`develop`** → собирает оба образа (api, web) для проверки, **без публикации и деплоя**.
- **Push тега `vX.Y.Z`** → собирает образы, публикует в GHCR с тегами `latest` и `vX.Y.Z`, затем деплоит на прод именно эту версию (`TAG=vX.Y.Z`).

## Расширение git-flow (необязательно)

Команды выше работают на голом git. Если установить расширение
(`brew install git-flow-avh`), те же сценарии короче:
```bash
git flow init -d                 # main / develop, префиксы по умолчанию
git flow feature start корзина   # завести feature/корзина
git flow feature finish корзина  # влить в develop
git flow release start 1.2.0
git flow release finish 1.2.0    # влить в main+develop и поставить тег
```
Конфиг расширения хранится локально в `.git/config` и в репозиторий не коммитится.

## Рекомендация: защита веток на GitHub

В настройках репозитория (Settings → Branches) задайте правила для `main` и `develop`:
- запретить прямой push,
- требовать прохождение проверки CI (`verify`) перед слиянием,
- требовать Pull Request с ревью.
