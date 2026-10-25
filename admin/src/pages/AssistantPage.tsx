import { useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '../api';
import type { AssistantModelOption, AssistantModelSettings } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { fmtContext, fmtCount, fmtDateTime } from '../lib/format';
import { filterModels, isDirty, MAX_FALLBACKS, moveFallback, selectPrimary, toggleFallback } from '../lib/models';
import type { ModelDraft } from '../lib/models';
import { AsyncView } from '../ui/AsyncView';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Badge, Card, PageHeader, SkeletonBlock } from '../ui/Display';
import { Segmented, SearchInput } from '../ui/Fields';
import { Icon } from '../ui/Icons';
import { Alert, ErrorState } from '../ui/States';
import { useToast } from '../ui/toast';

const PAGE = 20;
const MODEL_WORDS: [string, string, string] = ['модель', 'модели', 'моделей'];
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'free', label: 'Бесплатные' },
] as const;

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info">
      <span className="caption">{label}</span>
      {children}
    </div>
  );
}

function ModelRow({ option, isPrimary, fallbackIndex, canAddFallback, onPrimary, onFallback }: { option: AssistantModelOption; isPrimary: boolean; fallbackIndex: number; canAddFallback: boolean; onPrimary: () => void; onFallback: () => void }) {
  const isFallback = fallbackIndex >= 0;
  const blocked = !isFallback && !canAddFallback;
  const context = fmtContext(option.context_length);
  return (
    <li className={`model${isPrimary ? ' model--primary' : ''}`}>
      <button type="button" role="radio" aria-checked={isPrimary} className="model__head" onClick={onPrimary} aria-label={`${option.name}${option.free ? ', бесплатная' : ''}. Сделать основной`}>
        <span className={`radio${isPrimary ? ' is-on' : ''}`} aria-hidden="true" />
        <span className="model__text">
          <strong>{option.name}</strong>
          <span className="caption model__id">{option.id}</span>
          <span className="badges">
            {option.free ? <Badge tone="success">Бесплатно</Badge> : null}
            {isPrimary ? <Badge tone="info">Основная</Badge> : null}
            {context ? <span className="caption">{context}</span> : null}
          </span>
        </span>
      </button>
      {isPrimary ? null : (
        <button type="button" className={`model__fallback${isFallback ? ' is-on' : ''}`} onClick={onFallback} disabled={blocked}>
          <Icon name={isFallback ? 'check' : 'plus'} size={16} />
          {isFallback ? `Запасная ${fallbackIndex + 1} · убрать` : blocked ? `Запасных уже ${MAX_FALLBACKS}` : 'В запасные'}
        </button>
      )}
    </li>
  );
}

function ModelPicker({ stored, models }: { stored: AssistantModelSettings; models: AssistantModelOption[] }) {
  const toast = useToast();
  const [draft, setDraft] = useState<ModelDraft | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'free'>('all');
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  // сохранённая настройка перезаписывается после успешного PUT без повторной загрузки
  const [current, setCurrent] = useState(stored);

  const nameOf = (id: string) => models.find((m) => m.id === id)?.name ?? id;
  const working: ModelDraft = draft ?? { model: current.model, fallbacks: current.fallback_models };
  const dirty = draft !== null && isDirty(draft, current);
  const filtered = filterModels(models, query, filter === 'free');
  const visible = filtered.slice(0, shown);

  const edit = (next: ModelDraft) => {
    setSaved(false);
    setDraft(next);
  };

  const save = async () => {
    const result = await api.saveAssistantSettings({ model: working.model, fallback_models: working.fallbacks });
    setCurrent(result);
    setDraft(null);
    setConfirm(false);
    setSaved(true);
    toast.success('Модель помощника сохранена для всех пользователей');
  };

  return (
    <div className="stack stack--lg">
      <Alert tone="warning" title="Изменение действует на всех пользователей">
        Выбранная модель будет отвечать всем пользователям АгроОкно. Бесплатные модели могут работать нестабильно: отвечать медленно или быть недоступными, поэтому добавьте запасные.
      </Alert>

      <div className="two-col">
        <Card title="Сейчас используется">
          <div className="stack">
            <Info label="Основная модель">
              <strong>{nameOf(current.model)}</strong>
              <span className="caption">{current.model}</span>
            </Info>
            <Info label="Запасные модели">
              {current.fallback_models.length === 0 ? (
                <span className="small">Не выбраны</span>
              ) : (
                <ol className="plain-list">
                  {current.fallback_models.map((id, i) => (
                    <li key={id} className="small">{`${i + 1}. ${nameOf(id)}`}</li>
                  ))}
                </ol>
              )}
            </Info>
            <Info label="Кто и когда изменил">
              <span className="small">
                {current.updated_at || current.updated_by ? [current.updated_by, current.updated_at ? fmtDateTime(current.updated_at) : null].filter(Boolean).join(' · ') : 'Значение по умолчанию, ещё не менялось'}
              </span>
            </Info>
          </div>
        </Card>

        <Card
          title="Ваш выбор"
          className={dirty ? 'card--active' : undefined}
          actions={dirty ? <Badge tone="warning">Есть изменения</Badge> : undefined}
        >
          <div className="stack">
            <Info label="Основная модель">
              <strong>{nameOf(working.model)}</strong>
              <span className="caption">{working.model}</span>
            </Info>
            <Info label={`Запасные модели · ${working.fallbacks.length} из ${MAX_FALLBACKS}, по порядку`}>
              {working.fallbacks.length === 0 ? (
                <span className="small muted">Не выбраны. Если основная модель недоступна, помощник ответит по простым правилам. Добавьте запасные из списка ниже.</span>
              ) : (
                <ol className="fallbacks">
                  {working.fallbacks.map((id, i) => (
                    <li key={id} className="fallbacks__item">
                      <span className="fallbacks__num">{i + 1}</span>
                      <span className="small grow">{nameOf(id)}</span>
                      <IconButton label={`Выше: ${nameOf(id)}`} disabled={i === 0} onClick={() => edit(moveFallback(working, i, -1))}>
                        <Icon name="arrowUp" size={16} />
                      </IconButton>
                      <IconButton label={`Ниже: ${nameOf(id)}`} disabled={i === working.fallbacks.length - 1} onClick={() => edit(moveFallback(working, i, 1))}>
                        <Icon name="arrowDown" size={16} />
                      </IconButton>
                      <IconButton label={`Убрать из запасных: ${nameOf(id)}`} onClick={() => edit(toggleFallback(working, id))}>
                        <Icon name="close" size={16} />
                      </IconButton>
                    </li>
                  ))}
                </ol>
              )}
            </Info>
            <div className="row">
              <Button onClick={() => setConfirm(true)} disabled={!dirty}>
                Сохранить для всех пользователей
              </Button>
              {dirty ? (
                <Button variant="secondary" onClick={() => setDraft(null)}>
                  Сбросить изменения
                </Button>
              ) : null}
            </div>
            {saved && !dirty ? (
              <Alert tone="success" title="Сохранено">
                Новая модель действует для всех пользователей. Изменение применится к следующим сообщениям помощника.
              </Alert>
            ) : null}
          </div>
        </Card>
      </div>

      <Card title="Модели OpenRouter">
        <div className="stack">
          <p className="caption">Только модели с поддержкой вызова инструментов. Радио слева делает модель основной, кнопка под названием добавляет её в запасные.</p>
          <div className="toolbar">
            <SearchInput
              label="Поиск модели"
              placeholder="Название или идентификатор"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
            />
            <Segmented
              label="Фильтр моделей"
              options={FILTERS}
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setShown(PAGE);
              }}
            />
          </div>
          <ul className="models" role="radiogroup" aria-label="Основная модель">
            {visible.map((option) => (
              <ModelRow
                key={option.id}
                option={option}
                isPrimary={working.model === option.id}
                fallbackIndex={working.fallbacks.indexOf(option.id)}
                canAddFallback={working.fallbacks.length < MAX_FALLBACKS}
                onPrimary={() => edit(selectPrimary(working, option.id))}
                onFallback={() => edit(toggleFallback(working, option.id))}
              />
            ))}
          </ul>
          {filtered.length === 0 ? <p className="muted small" style={{ textAlign: 'center' }}>Модели не найдены. Измените запрос или фильтр.</p> : null}
          {filtered.length > visible.length ? (
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>{`Показать ещё (${filtered.length - visible.length})`}</Button>
          ) : null}
          {filtered.length > 0 ? <p className="caption" style={{ textAlign: 'center' }}>{`Найдено: ${fmtCount(filtered.length, MODEL_WORDS)}`}</p> : null}
        </div>
      </Card>

      <ConfirmDialog open={confirm} title="Сохранить для всех пользователей?" tone="primary" confirmLabel="Сохранить для всех" busyLabel="Сохраняем…" onCancel={() => setConfirm(false)} onConfirm={save}>
        <p>
          Помощник у всех пользователей будет работать на модели «<strong>{nameOf(working.model)}</strong>».
        </p>
        <p className="muted small">{working.fallbacks.length > 0 ? `Запасные по порядку: ${working.fallbacks.map(nameOf).join(' → ')}.` : 'Запасные модели не выбраны.'}</p>
        <Alert tone="warning">Изменение вступит в силу сразу для всех. Вернуть прежний выбор можно здесь же.</Alert>
      </ConfirmDialog>
    </div>
  );
}

export function AssistantPage() {
  usePageTitle('Модель помощника');
  const settings = useAsync('assistant:settings', () => api.assistantSettings());
  const models = useAsync('assistant:models', () => api.assistantModels());

  return (
    <div className="stack stack--lg">
      <PageHeader title="Модель помощника" subtitle="Настройка ИИ-помощника для всех пользователей" />
      <AsyncView
        wake
        state={settings}
        skeleton={
          <Card>
            <SkeletonBlock lines={6} />
          </Card>
        }
      >
        {(stored) =>
          models.error ? (
            <ErrorState error={models.error} onRetry={models.reload} />
          ) : models.data === undefined ? (
            <div className="stack">
              {models.slow ? <Alert tone="info" title="Загружаем список моделей">Список берётся у OpenRouter и может появиться не сразу.</Alert> : null}
              <Card>
                <SkeletonBlock lines={8} />
              </Card>
            </div>
          ) : (
            <ModelPicker stored={stored} models={models.data} />
          )
        }
      </AsyncView>
    </div>
  );
}
