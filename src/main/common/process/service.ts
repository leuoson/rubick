import { spawn, ChildProcess, exec } from 'child_process';
import path from 'path';

interface ManagedProcess {
  id: string;
  process: ChildProcess;
  cwd: string;
  command: string;
  args: string[];
  startedAt: string;
  output: string[];
  maxOutputLines: number;
}

/**
 * 进程管理服务 - 管理子进程（如 Vite 开发服务器）
 */
class ProcessService {
  private processes: Map<string, ManagedProcess> = new Map();

  /**
   * 启动进程
   */
  spawn(options: {
    id: string;
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string>;
    maxOutputLines?: number;
  }): { success: boolean; error?: string } {
    const { id, command, args = [], cwd, env, maxOutputLines = 100 } = options;

    // 检查进程是否已存在
    if (this.processes.has(id)) {
      return { success: false, error: `进程 ${id} 已存在` };
    }

    try {
      const childProcess = spawn(command, args, {
        cwd: path.resolve(cwd),
        env: { ...process.env, ...env },
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const managed: ManagedProcess = {
        id,
        process: childProcess,
        cwd,
        command,
        args,
        startedAt: new Date().toISOString(),
        output: [],
        maxOutputLines,
      };

      // 收集输出
      childProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          managed.output.push(`[stdout] ${line}`);
          if (managed.output.length > managed.maxOutputLines) {
            managed.output.shift();
          }
        }
      });

      childProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          managed.output.push(`[stderr] ${line}`);
          if (managed.output.length > managed.maxOutputLines) {
            managed.output.shift();
          }
        }
      });

      // 进程退出时清理
      childProcess.on('exit', (code) => {
        managed.output.push(`[exit] 进程退出，代码: ${code}`);
      });

      childProcess.on('error', (err) => {
        managed.output.push(`[error] ${err.message}`);
      });

      this.processes.set(id, managed);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 停止进程
   */
  kill(id: string): { success: boolean; error?: string } {
    const managed = this.processes.get(id);
    if (!managed) {
      return { success: false, error: `进程 ${id} 不存在` };
    }

    try {
      // 在 Windows 上使用 taskkill，其他平台使用 kill
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${managed.process.pid} /T /F`);
      } else {
        managed.process.kill('SIGTERM');
        // 如果 SIGTERM 没有效果，强制 kill
        setTimeout(() => {
          if (!managed.process.killed) {
            managed.process.kill('SIGKILL');
          }
        }, 3000);
      }
      this.processes.delete(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取进程状态
   */
  getStatus(id: string): {
    exists: boolean;
    running?: boolean;
    pid?: number;
    cwd?: string;
    command?: string;
    startedAt?: string;
    output?: string[];
  } {
    const managed = this.processes.get(id);
    if (!managed) {
      return { exists: false };
    }

    return {
      exists: true,
      running: !managed.process.killed && managed.process.exitCode === null,
      pid: managed.process.pid,
      cwd: managed.cwd,
      command: `${managed.command} ${managed.args.join(' ')}`,
      startedAt: managed.startedAt,
      output: managed.output.slice(-50), // 返回最后 50 行
    };
  }

  /**
   * 列出所有进程
   */
  list(): Array<{
    id: string;
    running: boolean;
    pid?: number;
    command: string;
    startedAt: string;
  }> {
    const result: Array<{
      id: string;
      running: boolean;
      pid?: number;
      command: string;
      startedAt: string;
    }> = [];

    for (const [id, managed] of this.processes) {
      result.push({
        id,
        running: !managed.process.killed && managed.process.exitCode === null,
        pid: managed.process.pid,
        command: `${managed.command} ${managed.args.join(' ')}`,
        startedAt: managed.startedAt,
      });
    }

    return result;
  }

  /**
   * 停止所有进程
   */
  killAll(): void {
    for (const id of this.processes.keys()) {
      this.kill(id);
    }
  }

  /**
   * 向进程发送输入
   */
  write(id: string, input: string): { success: boolean; error?: string } {
    const managed = this.processes.get(id);
    if (!managed) {
      return { success: false, error: `进程 ${id} 不存在` };
    }

    try {
      managed.process.stdin?.write(input);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const processService = new ProcessService();
export default processService;
