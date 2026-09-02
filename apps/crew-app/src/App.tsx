import { useAppApi } from '@kirocrew/app-sdk'
import type { CrewAppSurface, ProjectHistory, ProjectSessionSnapshot } from '@vibe-helper/contracts'
import {
  CrewAppClientError,
  CrewCoreClient,
  CrewSessionClient,
  type CrewConversationMessage,
  type CrewProjectSessions,
} from '@vibe-helper/kiro-adapter/crew-app'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import appStyles from './app.css?inline'

type RouteName = 'discovery' | 'spec' | 'build' | 'history'

interface AppRoute {
  readonly name: RouteName
  readonly projectId: string | null
}

interface ViewError {
  readonly kind: 'DISCONNECTED' | 'PERMISSION' | 'RECOVERABLE'
  readonly title: string
  readonly message: string
}

export interface VibeHelperAppProps {
  readonly coreClient: CrewCoreClient
  readonly sessionClient: CrewSessionClient
}

const surfaceRoute: Record<CrewAppSurface, RouteName> = {
  DISCOVERY: 'discovery',
  SPEC: 'spec',
  BUILD: 'build',
}

const routeLabels: Readonly<Record<RouteName, string>> = {
  discovery: 'Discovery',
  spec: 'Spec',
  build: 'Build',
  history: 'History',
}

function readRoute(): AppRoute {
  const raw = window.location.hash.slice(1) || '/history'
  const parsed = new URL(raw, window.location.origin)
  const candidate = parsed.pathname.replace(/^\//, '').toLowerCase()
  const name: RouteName =
    candidate === 'discovery' || candidate === 'spec' || candidate === 'build'
      ? candidate
      : 'history'
  return { name, projectId: parsed.searchParams.get('project') }
}

function href(name: RouteName, projectId?: string | null): string {
  const query = projectId === undefined || projectId === null ? '' : `?project=${projectId}`
  return `#/${name}${query}`
}

function correlationId(): string {
  return `corr_${crypto.randomUUID()}`
}

function viewError(error: unknown): ViewError {
  if (error instanceof CrewAppClientError && error.category === 'PERMISSION') {
    return { kind: 'PERMISSION', title: 'Permission required', message: error.message }
  }
  if (error instanceof CrewAppClientError && error.category === 'CONNECTION') {
    return {
      kind: 'DISCONNECTED',
      title: 'Core disconnected',
      message:
        'Vibe Helper could not reach its local Core. Your saved project data was not changed.',
    }
  }
  return {
    kind: 'RECOVERABLE',
    title: 'This view could not be restored',
    message:
      error instanceof Error ? error.message : 'An unexpected local error interrupted restoration.',
  }
}

function StatusPill({ value }: { readonly value: string }) {
  return (
    <span className={`status-pill status-${value.toLowerCase()}`}>
      {value.replaceAll('_', ' ')}
    </span>
  )
}

function EmptyState({ route }: { readonly route: RouteName }) {
  return (
    <section className="state-card empty-state" aria-labelledby="empty-title">
      <span className="state-mark" aria-hidden="true">
        ◌
      </span>
      <p className="eyebrow">Nothing to restore</p>
      <h2 id="empty-title">
        {route === 'history'
          ? 'Your project history starts here.'
          : `No ${routeLabels[route]} session yet.`}
      </h2>
      <p>
        Start Discovery from a new learning goal. Vibe Helper will keep the project, decisions,
        context, and redacted activity together as you move between modes.
      </p>
    </section>
  )
}

function ErrorState({ error, retry }: { readonly error: ViewError; readonly retry: () => void }) {
  return (
    <section className={`state-card error-state error-${error.kind.toLowerCase()}`} role="alert">
      <p className="eyebrow">{error.kind.replaceAll('_', ' ')}</p>
      <h2>{error.title}</h2>
      <p>{error.message}</p>
      <button type="button" className="primary-button" onClick={retry}>
        Try again
      </button>
    </section>
  )
}

function LoadingState({ label }: { readonly label: string }) {
  return (
    <section className="state-card loading-state" role="status" aria-live="polite">
      <span className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Restoring session</p>
      <h2>{label}</h2>
      <p>Reading durable Core state and reconnecting project conversations.</p>
    </section>
  )
}

function HistoryView({
  history,
  openProject,
}: {
  readonly history: ProjectHistory
  readonly openProject: (projectId: string, surface: CrewAppSurface) => void
}) {
  if (history.projects.length === 0) return <EmptyState route="history" />
  return (
    <section aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project history</p>
          <h2 id="history-title">Pick up where you left off.</h2>
        </div>
        <p>
          {history.projects.length} local project{history.projects.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="history-grid">
        {history.projects.map((item) => (
          <button
            className="project-card"
            type="button"
            key={item.project.id}
            onClick={() => openProject(item.project.id, item.suggestedSurface)}
          >
            <span className="project-card-topline">
              <StatusPill value={item.project.status} />
              <time dateTime={item.project.updatedAt}>
                {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                  new Date(item.project.updatedAt),
                )}
              </time>
            </span>
            <strong>{item.project.title}</strong>
            <span className="project-goal">{item.project.learningGoal}</span>
            <span className="project-metrics">
              <span>{item.pendingDecisionCount} decisions</span>
              <span>
                {item.currentContextVersion === null
                  ? 'No context'
                  : `Context v${item.currentContextVersion}`}
              </span>
              <span>{item.helperConversationCount} helper threads</span>
            </span>
            <span className="open-label">
              Open {routeLabels[surfaceRoute[item.suggestedSurface]]} →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function DiscoveryView({ snapshot }: { readonly snapshot: ProjectSessionSnapshot }) {
  const input = snapshot.discoverySession?.input
  return (
    <section className="content-grid" aria-labelledby="discovery-title">
      <article className="primary-panel">
        <p className="eyebrow">Learning direction</p>
        <h2 id="discovery-title">{snapshot.project.learningGoal}</h2>
        <p className="lede">
          {input?.personalNeed ??
            'Discovery is keeping the learning goal open until a useful project direction is selected.'}
        </p>
        <dl className="detail-list">
          <div>
            <dt>Session</dt>
            <dd>{snapshot.discoverySession?.status ?? 'Not started'}</dd>
          </div>
          <div>
            <dt>Current level</dt>
            <dd>{input?.currentLevel ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Recent friction</dt>
            <dd>{input?.recentFriction ?? 'None recorded'}</dd>
          </div>
        </dl>
      </article>
      <aside className="secondary-panel">
        <p className="eyebrow">Selected direction</p>
        <h3>{snapshot.selectedCandidate?.title ?? 'No candidate selected'}</h3>
        <p>
          {snapshot.selectedCandidate === null
            ? 'Candidate generation and comparison continue in the Discovery conversation.'
            : (snapshot.selectedCandidate.personalNeedRelationship ??
              snapshot.selectedCandidate.appeal)}
        </p>
      </aside>
    </section>
  )
}

function SpecView({ snapshot }: { readonly snapshot: ProjectSessionSnapshot }) {
  const spec = snapshot.learningSpec
  if (spec === null) return <EmptyState route="spec" />
  return (
    <section aria-labelledby="spec-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Learning spec · revision {spec.revision}</p>
          <h2 id="spec-title">{spec.productPurpose}</h2>
        </div>
        <StatusPill value={spec.status} />
      </div>
      <div className="spec-grid">
        <article className="primary-panel">
          <h3>Success moment</h3>
          <p className="lede">{spec.successMoment}</p>
          <h3>MVP features</h3>
          <ul className="clean-list">
            {spec.mvpFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
        <aside className="secondary-panel">
          <h3>Learning scope</h3>
          <ul className="scope-list">
            {spec.scope.map((item) => (
              <li key={`${item.category}-${item.title}`}>
                <span>{item.category.replaceAll('_', ' ')}</span>
                <strong>{item.title}</strong>
                <small>{item.conceptNames.join(' · ') || 'No concepts listed'}</small>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}

function Conversation({
  title,
  messages,
  empty,
}: {
  readonly title: string
  readonly messages: readonly CrewConversationMessage[]
  readonly empty: string
}) {
  return (
    <section className="conversation" aria-label={`${title} conversation`}>
      <header>
        <div>
          <p className="eyebrow">Crew runtime</p>
          <h3>{title}</h3>
        </div>
        <span className="live-dot">session</span>
      </header>
      <div className="message-list">
        {messages.length === 0 ? (
          <p className="conversation-empty">{empty}</p>
        ) : (
          messages.map((message) => (
            <div className={`message message-${message.role.toLowerCase()}`} key={message.key}>
              <span>{message.role === 'USER' ? 'You' : title}</span>
              <p>{message.content}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function BuildView({
  snapshot,
  sessions,
  crewError,
}: {
  readonly snapshot: ProjectSessionSnapshot
  readonly sessions: CrewProjectSessions | null
  readonly crewError: string | null
}) {
  const task = snapshot.currentTask
  return (
    <section aria-labelledby="build-title">
      <div className="section-heading build-heading">
        <div>
          <p className="eyebrow">Current task</p>
          <h2 id="build-title">{task?.title ?? 'Build has not started.'}</h2>
        </div>
        {task === null ? null : <StatusPill value={task.status} />}
      </div>
      {snapshot.liveContext === null ? null : (
        <article className="context-strip">
          <div>
            <span>Context v{snapshot.liveContext.contextVersion}</span>
            <strong>{snapshot.liveContext.stage}</strong>
          </div>
          <p>{snapshot.liveContext.currentGoal}</p>
          <small>{snapshot.liveContext.nextActions[0] ?? 'Waiting for the next checkpoint.'}</small>
        </article>
      )}
      {snapshot.pendingDecisions.length === 0 ? null : (
        <section className="decision-stack" aria-label="Pending decisions">
          {snapshot.pendingDecisions.map((decision) => (
            <article className="decision-card" key={decision.id}>
              <div>
                <p className="eyebrow">
                  Decision needed · {decision.category.replaceAll('_', ' ')}
                </p>
                <h3>{decision.question}</h3>
              </div>
              <p>{decision.reasonRequiredNow}</p>
              <span>{decision.options.length} options · Builder is waiting for you</span>
            </article>
          ))}
        </section>
      )}
      {crewError === null ? null : (
        <div className="inline-notice" role="status">
          <strong>Crew conversation unavailable.</strong> {crewError} Durable Core state remains
          visible.
        </div>
      )}
      <div className="conversation-grid">
        <Conversation
          title="Builder"
          messages={sessions?.builderMessages ?? []}
          empty="The project Builder conversation has no restorable messages yet."
        />
        <Conversation
          title="Helper"
          messages={sessions?.helperMessages ?? []}
          empty="Open Helper when you want a read-only explanation of the current task."
        />
      </div>
      <section className="durable-history" aria-labelledby="durable-helper-title">
        <div>
          <p className="eyebrow">Durable · redacted</p>
          <h3 id="durable-helper-title">Helper activity</h3>
        </div>
        {snapshot.helperConversations.length === 0 ? (
          <p>No durable Helper summaries have been recorded.</p>
        ) : (
          <ol>
            {snapshot.helperConversations.map((conversation) => (
              <li key={conversation.episodeId}>
                <strong>
                  {conversation.helperResponseSummaries.at(-1) ?? 'Helper exchange recorded'}
                </strong>
                <span>{conversation.redactedUserExcerpts.at(-1) ?? 'User excerpt redacted'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  )
}

export function VibeHelperApp({ coreClient, sessionClient }: VibeHelperAppProps) {
  const [route, setRoute] = useState<AppRoute>(readRoute)
  const [history, setHistory] = useState<ProjectHistory | null>(null)
  const [historyError, setHistoryError] = useState<ViewError | null>(null)
  const [snapshot, setSnapshot] = useState<ProjectSessionSnapshot | null>(null)
  const [sessions, setSessions] = useState<CrewProjectSessions | null>(null)
  const [crewError, setCrewError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<ViewError | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingSession, setLoadingSession] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const onHashChange = (): void => setRoute(readRoute())
    window.addEventListener('hashchange', onHashChange)
    if (window.location.hash === '') window.location.replace(href('history'))
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    void refresh
    let active = true
    setLoadingHistory(true)
    setHistoryError(null)
    void coreClient
      .listProjects(correlationId())
      .then((nextHistory) => {
        if (!active) return
        setHistory(nextHistory)
        if (route.name !== 'history' && route.projectId === null && nextHistory.projects[0]) {
          window.location.hash = href(route.name, nextHistory.projects[0].project.id).slice(1)
        }
      })
      .catch((error: unknown) => {
        if (active) setHistoryError(viewError(error))
      })
      .finally(() => {
        if (active) setLoadingHistory(false)
      })
    return () => {
      active = false
    }
  }, [coreClient, refresh, route.name, route.projectId])

  useEffect(() => {
    void refresh
    if (route.projectId === null) {
      setSnapshot(null)
      setSessions(null)
      setSessionError(null)
      return
    }
    let active = true
    setLoadingSession(true)
    setSessionError(null)
    setCrewError(null)
    void Promise.allSettled([
      coreClient.restoreProjectSession(correlationId(), route.projectId),
      sessionClient.restoreProject(route.projectId),
    ]).then(([coreResult, crewResult]) => {
      if (!active) return
      if (coreResult.status === 'fulfilled') setSnapshot(coreResult.value)
      else {
        setSnapshot(null)
        setSessionError(viewError(coreResult.reason))
      }
      if (crewResult.status === 'fulfilled') setSessions(crewResult.value)
      else {
        setSessions(null)
        setCrewError(
          crewResult.reason instanceof Error
            ? crewResult.reason.message
            : 'The local Crew session could not be restored.',
        )
      }
      setLoadingSession(false)
    })
    return () => {
      active = false
    }
  }, [coreClient, refresh, route.projectId, sessionClient])

  const retry = (): void => setRefresh((value) => value + 1)
  const selectedProjectId = route.projectId ?? snapshot?.project.id ?? null
  const navigate = (name: RouteName, projectId = selectedProjectId): void => {
    window.location.hash = href(name, name === 'history' ? null : projectId).slice(1)
  }
  const openProject = (projectId: string, surface: CrewAppSurface): void =>
    navigate(surfaceRoute[surface], projectId)

  let content: ReactNode
  if (historyError !== null) content = <ErrorState error={historyError} retry={retry} />
  else if (route.name === 'history')
    content =
      loadingHistory || history === null ? (
        <LoadingState label="Opening Project History" />
      ) : (
        <HistoryView history={history} openProject={openProject} />
      )
  else if (loadingSession) content = <LoadingState label={`Opening ${routeLabels[route.name]}`} />
  else if (sessionError !== null) content = <ErrorState error={sessionError} retry={retry} />
  else if (snapshot === null) content = <EmptyState route={route.name} />
  else if (route.name === 'discovery') content = <DiscoveryView snapshot={snapshot} />
  else if (route.name === 'spec') content = <SpecView snapshot={snapshot} />
  else content = <BuildView snapshot={snapshot} sessions={sessions} crewError={crewError} />

  return (
    <>
      <style>{appStyles}</style>
      <main className="app-shell">
        <header className="app-header">
          <a className="brand" href={href('history')} aria-label="Vibe Helper Project History">
            <span className="brand-mark" aria-hidden="true">
              vh
            </span>
            <span>
              <strong>Vibe Helper</strong>
              <small>Learn through your own build.</small>
            </span>
          </a>
          <nav aria-label="Project workspace">
            {(Object.keys(routeLabels) as RouteName[]).map((name) => (
              <a
                key={name}
                href={href(name, name === 'history' ? null : selectedProjectId)}
                aria-current={route.name === name ? 'page' : undefined}
              >
                {routeLabels[name]}
              </a>
            ))}
          </nav>
          <label className="project-select">
            <span>Project</span>
            <select
              aria-label="Current project"
              value={selectedProjectId ?? ''}
              onChange={(event) => {
                const item = history?.projects.find(
                  (candidate) => candidate.project.id === event.target.value,
                )
                if (item !== undefined) openProject(item.project.id, item.suggestedSurface)
              }}
              disabled={history === null || history.projects.length === 0}
            >
              {history?.projects.length === 0 ? <option value="">No projects</option> : null}
              {history?.projects.map((item) => (
                <option key={item.project.id} value={item.project.id}>
                  {item.project.title}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="page-frame">
          <div className="route-context">
            <span>{routeLabels[route.name]}</span>
            {snapshot === null ? null : (
              <>
                <i aria-hidden="true">/</i>
                <strong>{snapshot.project.title}</strong>
                <StatusPill value={snapshot.project.status} />
              </>
            )}
          </div>
          {content}
        </div>
      </main>
    </>
  )
}

export function App() {
  const api = useAppApi()
  const clients = useMemo(
    () => ({ core: new CrewCoreClient(api), sessions: new CrewSessionClient(api) }),
    [api],
  )
  return <VibeHelperApp coreClient={clients.core} sessionClient={clients.sessions} />
}

export default App
