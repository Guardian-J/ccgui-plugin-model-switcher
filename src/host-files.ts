type HostProps = Record<string, any>;

function ancestors(element: Element): HostProps[] {
  const key = Object.keys(element).find(key => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
  if (!key) return [];
  let fiber = (element as unknown as Record<string, any>)[key];
  let root = fiber;
  while (root?.return) root = root.return;
  if (root?.stateNode?.current && root.stateNode.current !== root) fiber = fiber.alternate;
  const props = [];
  for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return) {
    if (fiber.memoizedProps) props.push(fiber.memoizedProps);
  }
  return props;
}

function normalize(path: string) { return path.replace(/\\/g, "/").replace(/\/$/, ""); }

function findOpenFile(workspace: string): ((path: string) => Promise<void>) | undefined {
  for (const button of document.querySelectorAll<HTMLElement>('button[title]')) {
    if (button.closest('[data-plugin-file-search]')) continue;
    const title = normalize(button.title);
    const root = normalize(workspace);
    if (title !== root && !title.startsWith(`${root}/`)) continue;
    for (const props of ancestors(button)) {
      if (typeof props.onOpenFile === "function" && props.node?.path) return props.onOpenFile;
    }
  }
}

export async function openHostFile(workspace: string, path: string, isCurrent: () => boolean): Promise<void> {
  if (!isCurrent()) return;
  let open = findOpenFile(workspace);
  if (!open) {
    // Hidden native trees may not have measured virtual rows yet. Reveal the files tab first.
    let header: HostProps | undefined;
    let headerElement: Element | undefined;
    for (const button of document.querySelectorAll('button')) {
      header = ancestors(button).find(props => typeof props.onPanelTabChange === 'function' && props.workspacePath === workspace);
      if (header) { headerElement = button; break; }
    }
    if (header) {
      const previous = header.panelTab;
      header.onPanelTabChange('files');
      for (let attempt = 0; attempt < 20 && isCurrent(); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        open = findOpenFile(workspace);
        if (open) break;
      }
      const current = headerElement && ancestors(headerElement).find(props => typeof props.onPanelTabChange === 'function' && props.workspacePath === workspace);
      if (isCurrent() && current?.panelTab === 'files') current.onPanelTabChange(previous);
    }
  }
  if (!isCurrent()) return;
  if (!open) throw new Error("无法连接文件编辑器，请打开文件页签后重试");
  await open(path);
}
