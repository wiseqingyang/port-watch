import type { PortService } from '../types.js';

export type SortMode =
  | 'dir-asc'
  | 'uptime-desc'
  | 'port-asc'
  | 'port-desc'
  | 'memory-desc'
  | 'name-asc';

export type ViewMode = 'tree' | 'flat';

export interface FileSystemTreeNode {
  id: string; // 唯一节点标识 (fullPath)
  name: string; // 目录名称或压缩后的多级路径名称，例如 "/" 或 "Users/developer" 或 "cli-tools/port-watch"
  fullPath: string; // 真实绝对工作目录路径
  depth: number; // 树形深度，0 代表根目录 "/"
  isRoot: boolean; // 是否是操作系统根节点 "/"
  isProject: boolean; // 是否是检测到的代码项目目录
  projectName?: string; // 项目名称 (例如 "port-watch")

  // 直接在该目录下运行的端口服务程序
  directServices: PortService[];

  // 子文件夹目录列表
  children: FileSystemTreeNode[];

  // 当前子树递归聚合统计指标
  allServices: PortService[]; // 包含 directServices 以及所有后代服务的全量集合
  allPorts: number[]; // 聚合的所有监听端口（从小到大排序）
  totalServicesCount: number; // allServices.length
  totalMemoryMb: number; // 聚合内存占用 (MB)
}

/** 比较两个服务的最近启动时间 */
function compareUptime(a: PortService, b: PortService): number {
  const aSec = a.uptimeSec ?? 999999999;
  const bSec = b.uptimeSec ?? 999999999;
  if (aSec !== bSec) return aSec - bSec;
  return b.pid - a.pid;
}

/** 比较两个服务的稳定字母序 (CWD -> Name -> Port) */
function compareStableAlphabetical(a: PortService, b: PortService): number {
  const aCwd = (a.cwd || '').toLowerCase();
  const bCwd = (b.cwd || '').toLowerCase();
  if (aCwd !== bCwd) return aCwd.localeCompare(bCwd);
  const nameCmp = a.displayName.localeCompare(b.displayName);
  if (nameCmp !== 0) return nameCmp;
  return a.port - b.port;
}

/** 对服务列表进行排序 */
export function sortServicesList(services: PortService[], sortMode: SortMode): PortService[] {
  return [...services].sort((a, b) => {
    switch (sortMode) {
      case 'uptime-desc':
        return compareUptime(a, b);
      case 'port-asc':
        return a.port - b.port;
      case 'port-desc':
        return b.port - a.port;
      case 'memory-desc':
        return b.memoryMb - a.memoryMb;
      case 'name-asc':
        return a.displayName.localeCompare(b.displayName);
      case 'dir-asc':
      default:
        return compareStableAlphabetical(a, b);
    }
  });
}

/** 比较两个目录子节点的排序 */
function compareTreeNode(a: FileSystemTreeNode, b: FileSystemTreeNode, sortMode: SortMode): number {
  switch (sortMode) {
    case 'uptime-desc': {
      const aMin = Math.min(...a.allServices.map((s) => s.uptimeSec ?? 999999999));
      const bMin = Math.min(...b.allServices.map((s) => s.uptimeSec ?? 999999999));
      if (aMin !== bMin) return aMin - bMin;
      break;
    }
    case 'memory-desc':
      if (b.totalMemoryMb !== a.totalMemoryMb) return b.totalMemoryMb - a.totalMemoryMb;
      break;
    case 'port-asc': {
      const aMin = Math.min(...a.allPorts, 999999);
      const bMin = Math.min(...b.allPorts, 999999);
      if (aMin !== bMin) return aMin - bMin;
      break;
    }
    case 'port-desc': {
      const aMax = Math.max(...a.allPorts, 0);
      const bMax = Math.max(...b.allPorts, 0);
      if (aMax !== bMax) return bMax - aMax;
      break;
    }
    default:
      break;
  }

  // 默认 dir-asc 或稳定字母序 A-Z
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

// 内部构建用原始节点
class RawTreeNode {
  name: string;
  fullPath: string;
  isRoot: boolean;
  directServices: PortService[] = [];
  childrenMap: Map<string, RawTreeNode> = new Map();
  isProject = false;
  projectName?: string;

  constructor(name: string, fullPath: string, isRoot = false) {
    this.name = name;
    this.fullPath = fullPath;
    this.isRoot = isRoot;
  }
}

/**
 * 递归构建操作系统真实文件系统树形结构：
 * 1. 所有项目均归属于系统根目录 "/"
 * 2. 多级无端口程序的空文件夹自动合并展示，用 "/" 分隔
 * 3. 展开后可查看下层文件夹以及当前文件夹直属的端口服务进程
 */
export function buildFileSystemTree(
  services: PortService[],
  sortMode: SortMode
): FileSystemTreeNode | null {
  if (services.length === 0) return null;

  const root = new RawTreeNode('/', '/', true);

  // 1. 将所有服务归集并插入到原始文件路径字典树中
  for (const s of services) {
    const rawPath = s.cwd || s.project?.path || '/';
    const cleanPath = rawPath === '/' ? '/' : rawPath.replace(/[/\\]+$/, '');

    if (cleanPath === '/') {
      root.directServices.push(s);
      continue;
    }

    const segments = cleanPath.split('/').filter(Boolean);
    let curr = root;
    let currPath = '';

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      currPath = currPath + '/' + seg;
      if (!curr.childrenMap.has(seg)) {
        curr.childrenMap.set(seg, new RawTreeNode(seg, currPath));
      }
      curr = curr.childrenMap.get(seg)!;
      if (s.project?.path === currPath) {
        curr.projectName = s.project.name;
        curr.isProject = true;
      }
    }

    curr.directServices.push(s);
  }

  // 2. 自底向上递归：压缩多级空文件夹并聚合子树指标
  function compactAndAggregate(node: RawTreeNode): FileSystemTreeNode {
    const compactedChildren: FileSystemTreeNode[] = [];
    for (const [, child] of node.childrenMap.entries()) {
      compactedChildren.push(compactAndAggregate(child));
    }

    // 排序直接子服务
    node.directServices = sortServicesList(node.directServices, sortMode);

    let resultNode: FileSystemTreeNode = {
      id: node.fullPath,
      name: node.name,
      fullPath: node.fullPath,
      depth: 0,
      isRoot: node.isRoot,
      isProject: node.isProject,
      projectName: node.projectName,
      directServices: node.directServices,
      children: compactedChildren,
      allServices: [],
      allPorts: [],
      totalMemoryMb: 0,
      totalServicesCount: 0,
    };

    // 压缩逻辑：如果不是根目录、没有直属服务且只有一个子文件夹，则自动与子文件夹合并用 "/" 间隔
    if (!node.isRoot && !node.isProject && node.directServices.length === 0 && compactedChildren.length === 1) {
      const singleChild = compactedChildren[0];
      resultNode = {
        id: singleChild.id,
        name: `${node.name}/${singleChild.name}`,
        fullPath: singleChild.fullPath,
        depth: 0,
        isRoot: false,
        isProject: singleChild.isProject || node.isProject,
        projectName: singleChild.projectName || node.projectName,
        directServices: singleChild.directServices,
        children: singleChild.children,
        allServices: [],
        allPorts: [],
        totalMemoryMb: 0,
        totalServicesCount: 0,
      };
    }

    // 计算当前子树的聚合统计
    const aggregatedServices = [...resultNode.directServices];
    for (const child of resultNode.children) {
      aggregatedServices.push(...child.allServices);
    }
    resultNode.allServices = aggregatedServices;
    resultNode.totalServicesCount = aggregatedServices.length;

    const portSet = new Set<number>();
    let totalMem = 0;
    for (const s of aggregatedServices) {
      totalMem += s.memoryMb;
      for (const p of s.ports) {
        portSet.add(p);
      }
    }
    resultNode.allPorts = Array.from(portSet).sort((a, b) => a - b);
    resultNode.totalMemoryMb = Math.round(totalMem * 10) / 10;

    // 子文件夹列表按当前排序规则排序
    resultNode.children.sort((a, b) => compareTreeNode(a, b, sortMode));

    return resultNode;
  }

  // 3. 递归分配深度 depth
  function assignDepth(node: FileSystemTreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  }

  const finalTree = compactAndAggregate(root);
  assignDepth(finalTree, 0);

  return finalTree;
}

/** 递归获取树中所有的目录节点列表（便于全部展开/全部折叠计算） */
export function getAllFolderNodes(root: FileSystemTreeNode): FileSystemTreeNode[] {
  const result: FileSystemTreeNode[] = [root];
  for (const child of root.children) {
    result.push(...getAllFolderNodes(child));
  }
  return result;
}
