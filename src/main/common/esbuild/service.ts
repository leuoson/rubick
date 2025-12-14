import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vuePlugin = require('esbuild-plugin-vue3');

interface BuildOptions {
  projectPath: string;
  entryPoint?: string;
  outdir?: string;
}

interface BuildResult {
  success: boolean;
  outputFiles?: { path: string; contents: string }[];
  error?: string;
}

interface ServeOptions {
  projectPath: string;
  port?: number;
}

interface ServeResult {
  success: boolean;
  url?: string;
  port?: number;
  error?: string;
}

class EsbuildService {
  private servers: Map<string, { stop: () => Promise<void>; port: number }> = new Map();

  /**
   * 编译项目
   */
  async build(options: BuildOptions): Promise<BuildResult> {
    try {
      const { projectPath, entryPoint = 'src/main.js', outdir = 'dist' } = options;
      
      const entryPath = path.join(projectPath, entryPoint);
      const outPath = path.join(projectPath, outdir);

      // 检查入口文件是否存在
      if (!fs.existsSync(entryPath)) {
        // 尝试其他常见入口
        const alternatives = ['src/main.ts', 'src/index.js', 'src/index.ts', 'index.js'];
        let found = false;
        for (const alt of alternatives) {
          const altPath = path.join(projectPath, alt);
          if (fs.existsSync(altPath)) {
            found = true;
            break;
          }
        }
        if (!found) {
          return { success: false, error: `入口文件不存在: ${entryPath}` };
        }
      }

      const result = await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        outdir: outPath,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        plugins: [vuePlugin()],
        loader: {
          '.ts': 'ts',
          '.tsx': 'tsx',
          '.jsx': 'jsx',
        },
        write: true,
      });

      return {
        success: true,
        outputFiles: result.outputFiles?.map(f => ({
          path: f.path,
          contents: f.text,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 启动开发服务器
   */
  async serve(options: ServeOptions): Promise<ServeResult> {
    try {
      const { projectPath, port = 8080 } = options;

      // 检查是否已有服务器运行
      if (this.servers.has(projectPath)) {
        const existing = this.servers.get(projectPath)!;
        return {
          success: true,
          url: `http://localhost:${existing.port}`,
          port: existing.port,
        };
      }

      // 确定入口点
      let entryPoint = 'src/main.js';
      const alternatives = ['src/main.ts', 'src/index.js', 'src/index.ts'];
      for (const alt of [entryPoint, ...alternatives]) {
        if (fs.existsSync(path.join(projectPath, alt))) {
          entryPoint = alt;
          break;
        }
      }

      // 启动 esbuild 开发服务器
      const ctx = await esbuild.context({
        entryPoints: [path.join(projectPath, entryPoint)],
        bundle: true,
        outdir: path.join(projectPath, 'dist'),
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        plugins: [vuePlugin()],
        loader: {
          '.ts': 'ts',
          '.tsx': 'tsx',
          '.jsx': 'jsx',
        },
      });

      const server = await ctx.serve({
        servedir: path.join(projectPath, 'public'),
        port,
      });

      this.servers.set(projectPath, {
        stop: async () => {
          await ctx.dispose();
        },
        port: server.port,
      });

      return {
        success: true,
        url: `http://localhost:${server.port}`,
        port: server.port,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 停止开发服务器
   */
  async stopServer(projectPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const server = this.servers.get(projectPath);
      if (server) {
        await server.stop();
        this.servers.delete(projectPath);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取所有运行中的服务器
   */
  listServers(): Array<{ projectPath: string; port: number }> {
    return Array.from(this.servers.entries()).map(([projectPath, { port }]) => ({
      projectPath,
      port,
    }));
  }
}

export default new EsbuildService();
