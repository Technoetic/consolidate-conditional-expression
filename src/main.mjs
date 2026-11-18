import { LessonScreen } from './lesson.mjs';
import { Navigation } from './services/navigation.mjs';
import { VersionService } from './services/version.mjs';

const workspace = document.getElementById('workspace');
const status = document.getElementById('runtime-status');
const links = [...document.querySelectorAll('a.tab-link')];
const messages = {
  clear: '',
  offline: '새 버전을 확인할 수 없습니다. 현재 수업을 계속할 수 있어요.',
  update: '새 버전이 있습니다. 다음 단계로 이동하면 적용됩니다.',
  protect: '선택을 이 탭에 보관하고 있습니다. 선택이 저장되면 다음 단계에서 새 버전을 적용합니다.'
};

const lesson = new LessonScreen(workspace, { navigate: route => navigation.go(route) });
const version = new VersionService({
  entry: location.href,
  loaded: document.querySelector('meta[name="app-build"]').content
});

function render(route, focus) {
  document.body.dataset.screen = route ?? 'missing';
  for (const link of links) {
    if (link.hash === '#/' + route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (route) lesson.render(route);
  else {
    const section = document.createElement('section');
    section.className = 'missing-screen';
    const title = document.createElement('h2');
    title.textContent = '이 학습 단계를 찾을 수 없습니다';
    const link = document.createElement('a');
    link.href = '#/observe';
    link.textContent = '첫 단계로 돌아가기';
    section.append(title, link);
    workspace.replaceChildren(section);
  }
  if (focus) {
    const heading = workspace.querySelector('h2') ?? workspace;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    workspace.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

const navigation = new Navigation({
  version, render,
  readState: () => ({ dirty: lesson.hasUnsavedState, saving: false }),
  notify: kind => {
    const message = messages[kind];
    if (status && status.textContent !== message) status.textContent = message;
  }
});
void navigation.start();
