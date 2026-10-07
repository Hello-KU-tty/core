// Seeds one synthetic Project/Task into a stopped development Core root for Kiro-native checks.
// Fixture data is setup only: it is never an Agent success or learner Evidence.
import { join, resolve } from 'node:path'
import * as schemas from '../packages/contracts/dist/index.js'
import * as fixtures from '../packages/contracts/test/fixtures.ts'
import { privateDirectory } from '../packages/runtime/dist/private-directory.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const coreRoot = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('usage: seed-kiro-native-demo.mjs <core-root> [campus-drop]')
// Campus Drop is the Golden Path fixture whose Learning Spec owns link expiry and access tokens.
const campusDrop = process.argv[3] === 'campus-drop'
const content = campusDrop
  ? {
      ...fixtures.learningSpecDraftContentFixture,
      productPurpose: '공용 PC와 개인 기기 사이에서 로그인 없이 파일을 주고받는다.',
      targetUsers: ['학교 공용 PC를 쓰는 대학생'],
      primaryUsageMoment: '공용 PC에서 과제 파일을 휴대폰으로 옮길 때',
      successMoment: '받은 링크로 파일을 내려받고, 시간이 지나면 링크가 막힌다.',
      mvpFeatures: ['파일 업로드', '만료되는 공유 링크 생성', '만료된 링크 차단'],
      scope: [
        {
          category: 'LEARNER_FOCUS',
          title: '만료되는 공유 링크와 접근 토큰',
          rationale: '링크를 얼마나 열어 둘지와 위조를 막는 방법이 서비스의 핵심 판단이다.',
          conceptNames: ['link expiry', 'access token'],
        },
        {
          category: 'AGENT_SUPPORT',
          title: '로컬 서버와 파일 저장',
          rationale: '필요하지만 이번 학습 목표는 아니다.',
          conceptNames: [],
        },
        {
          category: 'EXCLUDED',
          title: '로그인, 영구 보관, 대용량 업로드',
          rationale: 'MVP 범위를 넘는다.',
          conceptNames: [],
        },
      ],
      expectedDecisions: [
        {
          category: 'PRODUCT_BEHAVIOR',
          description: '공유 링크를 얼마 동안 열 수 있게 할지 정한다.',
          whyUserInputMatters: '보안과 편의가 직접 바뀌는 학습자의 판단이다.',
        },
      ],
    }
  : fixtures.learningSpecDraftContentFixture
const project = campusDrop
  ? {
      ...fixtures.projectFixture,
      title: 'Campus Drop',
      learningGoal:
        'TypeScript로 만료되는 파일 공유 흐름을 만들며 데이터 모델과 접근 제어를 배우고 싶다',
    }
  : fixtures.projectFixture
const task = campusDrop
  ? {
      ...fixtures.builderTaskFixture,
      title: '만료되는 공유 링크 만들기',
      productGoal: '파일마다 일정 시간 뒤 만료되는 다운로드 링크를 만든다.',
      requirements: ['링크마다 만료 시각을 둔다.', '만료된 링크는 거절한다.'],
      acceptanceCriteria: [
        { key: 'expiring_link', description: '만료 시각이 지난 링크는 거절된다.' },
      ],
      expectedConcepts: ['link expiry', 'access token'],
      excludedWork: ['로그인'],
      expectedDecisionCategories: ['PRODUCT_BEHAVIOR'],
    }
  : fixtures.builderTaskFixture
const workspacePath = `projects/${fixtures.ids.project}`
await privateDirectory(join(coreRoot, 'workspaces', 'projects'))
await privateDirectory(join(coreRoot, 'workspaces', workspacePath))
const storage = await openSqliteStorage({ dataDirectory: join(coreRoot, 'data') })
try {
  storage.transaction((repository) => {
    if (repository.recoverProject(fixtures.ids.project)) return
    repository.appendProject(
      schemas.projectSchema.parse({ ...project, generatedWorkspacePath: workspacePath }),
    )
    repository.appendDiscoverySession(
      schemas.discoverySessionSchema.parse(fixtures.discoverySessionFixture),
    )
    repository.appendCandidate(
      schemas.projectCandidateRevisionSchema.parse(fixtures.candidateFixture),
    )
    repository.appendCandidateRound(
      schemas.candidateRoundSchema.parse(fixtures.candidateRoundFixture),
    )
    repository.appendDiscoveryFeedback(
      schemas.discoveryFeedbackSchema.parse(fixtures.discoveryFeedbackFixture),
    )
    repository.appendLearningSpec(
      schemas.learningSpecRevisionSchema.parse({
        ...fixtures.draftLearningSpecFixture,
        ...content,
      }),
    )
    repository.appendLearningSpec(
      schemas.learningSpecRevisionSchema.parse({
        ...fixtures.confirmedLearningSpecFixture,
        ...content,
      }),
    )
    repository.appendTask(schemas.builderTaskSchema.parse(task))
    repository.appendLiveContext(
      schemas.liveProjectContextSchema.parse({
        ...fixtures.liveContextFixture,
        checkpoint: 'TASK_STARTED',
        activeDecisionIds: [],
      }),
    )
  })
} finally {
  storage.close()
}
process.stdout.write(
  `${JSON.stringify({
    projectId: fixtures.ids.project,
    taskId: fixtures.ids.task,
    correlationId: fixtures.builderTaskFixture.correlationId,
    workspace: join(coreRoot, 'workspaces', workspacePath),
    scenario: campusDrop ? 'campus-drop' : 'fixture',
    provenance: 'SYNTHETIC_FIXTURE',
  })}\n`,
)
