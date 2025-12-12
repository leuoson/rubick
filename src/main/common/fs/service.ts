import fs from 'fs';
import path from 'path';

/**
 * 文件系统服务 - 提供安全的文件操作
 */
class FileSystemService {
  /**
   * 读取文件内容
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const absolutePath = path.resolve(filePath);
    return fs.promises.readFile(absolutePath, { encoding });
  }

  /**
   * 写入文件内容（自动创建目录）
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(absolutePath, content, 'utf-8');
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    const absolutePath = path.resolve(filePath);
    await fs.promises.unlink(absolutePath);
  }

  /**
   * 重命名/移动文件
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const absoluteOldPath = path.resolve(oldPath);
    const absoluteNewPath = path.resolve(newPath);
    
    // 确保目标目录存在
    const dir = path.dirname(absoluteNewPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    await fs.promises.rename(absoluteOldPath, absoluteNewPath);
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    const absolutePath = path.resolve(filePath);
    try {
      await fs.promises.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取目录内容
   */
  async readDir(dirPath: string): Promise<Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
  }>> {
    const absolutePath = path.resolve(dirPath);
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    
    const result: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
      modifiedAt: string;
    }> = [];
    for (const entry of entries) {
      const entryPath = path.join(absolutePath, entry.name);
      try {
        const stats = await fs.promises.stat(entryPath);
        result.push({
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch {
        // 跳过无法访问的文件
      }
    }
    
    return result;
  }

  /**
   * 递归读取目录树
   */
  async readDirRecursive(
    dirPath: string,
    options: { maxDepth?: number; excludePatterns?: string[] } = {}
  ): Promise<Array<{
    name: string;
    path: string;
    relativePath: string;
    isDirectory: boolean;
    size: number;
  }>> {
    const { maxDepth = 10, excludePatterns = ['node_modules', '.git', 'dist', 'build'] } = options;
    const absolutePath = path.resolve(dirPath);
    const result: Array<{
      name: string;
      path: string;
      relativePath: string;
      isDirectory: boolean;
      size: number;
    }> = [];

    const walk = async (currentPath: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          // 检查排除模式
          if (excludePatterns.some(pattern => entry.name === pattern || entry.name.startsWith('.'))) {
            continue;
          }

          const entryPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(absolutePath, entryPath);

          try {
            const stats = await fs.promises.stat(entryPath);
            result.push({
              name: entry.name,
              path: entryPath,
              relativePath,
              isDirectory: entry.isDirectory(),
              size: stats.size,
            });

            if (entry.isDirectory()) {
              await walk(entryPath, depth + 1);
            }
          } catch {
            // 跳过无法访问的文件
          }
        }
      } catch {
        // 跳过无法访问的目录
      }
    };

    await walk(absolutePath, 0);
    return result;
  }

  /**
   * 创建目录
   */
  async mkdir(dirPath: string): Promise<void> {
    const absolutePath = path.resolve(dirPath);
    await fs.promises.mkdir(absolutePath, { recursive: true });
  }

  /**
   * 删除目录（递归）
   */
  async rmdir(dirPath: string): Promise<void> {
    const absolutePath = path.resolve(dirPath);
    await fs.promises.rm(absolutePath, { recursive: true, force: true });
  }

  /**
   * 获取文件信息
   */
  async stat(filePath: string): Promise<{
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    createdAt: string;
    modifiedAt: string;
  }> {
    const absolutePath = path.resolve(filePath);
    const stats = await fs.promises.stat(absolutePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
    };
  }

  /**
   * 复制文件
   */
  async copyFile(srcPath: string, destPath: string): Promise<void> {
    const absoluteSrc = path.resolve(srcPath);
    const absoluteDest = path.resolve(destPath);
    
    // 确保目标目录存在
    const dir = path.dirname(absoluteDest);
    await fs.promises.mkdir(dir, { recursive: true });
    
    await fs.promises.copyFile(absoluteSrc, absoluteDest);
  }
}

export const fsService = new FileSystemService();
export default fsService;
