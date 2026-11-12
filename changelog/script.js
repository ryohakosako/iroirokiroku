async function loadAppName() {
  try {
    const response = await fetch('../app-info.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info = await response.json();
    if (typeof info.name !== 'string' || !info.name.trim()) throw new Error('アプリ名が不正です');
    document.title = `更新履歴 | ${info.name}`;
    const heading = document.querySelector('#app-name');
    heading.replaceChildren(document.createTextNode(info.name + ' '));
    const span = document.createElement('span');
    span.textContent = '更新履歴';
    heading.append(span);
  } catch (error) {
    console.warn('アプリ名を取得できませんでした', error);
  }
}
loadAppName();

const entriesEl = document.querySelector('#entries');
const summaryEl = document.querySelector('#summary');

async function loadChangelog() {
  try {
    const response = await fetch('../changelog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error('更新履歴の形式が不正です');

    summaryEl.textContent = `${entries.length} 件の更新履歴`;
    if (entries.length === 0) {
      summaryEl.textContent = '更新履歴はまだありません。';
      return;
    }

    entries.forEach((entry, index) => {
      const section = document.createElement('section');
      section.className = 'entry';
      const header = document.createElement('header');
      const title = document.createElement('h2');
      title.textContent = entry.version || 'バージョン不明';
      header.append(title);
      if (index === 0) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'LATEST';
        header.append(tag);
      }
      const date = document.createElement('time');
      date.textContent = entry.updated || '';
      const message = document.createElement('p');
      message.textContent = entry.message || '更新内容の記録なし';
      const footer = document.createElement('footer');
      const link = document.createElement('a');
      link.textContent = `コミットを見る · ${entry.commit || ''}`;
      // 自分のリポジトリのGitHubコミットURLだけをリンク先として許可
      if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{40}$/.test(entry.commitUrl || '')) {
        link.href = entry.commitUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        footer.append(link);
      }
      section.append(header, date, message, footer);
      entriesEl.append(section);
    });
  } catch (error) {
    summaryEl.textContent = '更新履歴を読み込めませんでした。公開設定と changelog.json を確認してください。';
    summaryEl.classList.add('error');
    console.error(error);
  }
}
loadChangelog();
