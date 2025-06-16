import { Logger } from "koishi";
import { randomUUID } from "crypto";

// 定义任务可能的状态
type TaskStatus = "pending" | "processing" | "completed" | "failed";

// 任务的数据结构（移除了 attempts 和 maxRetries）
interface Task<T> {
  id: string;
  payload: T;
  status: TaskStatus;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

// 处理器函数的类型定义
type TaskProcessor<T> = (payload: T) => Promise<void>;

// 队列构造函数的选项（移除了 defaultMaxRetries）
interface QueueOptions {
  concurrency?: number;
}

export class Queue<T> {
  private tasks: Task<T>[] = [];
  private processor: TaskProcessor<T>;
  private readonly concurrency: number;
  private activeTasks: number = 0;
  private logger: Logger;

  constructor(
    processor: TaskProcessor<T>,
    options: QueueOptions = {},
    logger: Logger
  ) {
    this.logger = logger;
    this.processor = processor;
    this.concurrency = options.concurrency || 1;
  }

  /**
   * 向队列添加一个新任务
   */
  public add(payload: T): Task<T> {
    const task: Task<T> = {
      id: randomUUID(),
      payload,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.tasks.push(task);
    console.log(`[任务添加] ID: ${task.id}`);

    // 异步地尝试处理队列
    setTimeout(() => this._processQueue(), 0);

    return task;
  }

  /**
   * 获取任务状态
   */
  public getTask(id: string): Task<T> | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /**
   * 获取所有任务的只读列表
   */
  public getAllTasks(): Readonly<Task<T>[]> {
    return this.tasks;
  }

  /**
   * 检查并处理队列中的任务
   */
  private _processQueue(): void {
    while (this.activeTasks < this.concurrency) {
      const task = this.tasks.find((t) => t.status === "pending");
      if (!task) {
        break; // 没有待处理任务
      }

      this.activeTasks++;
      task.status = "processing";
      console.log(`[任务开始] ID: ${task.id}`);

      this._runTask(task);
    }
  }

  /**
   * 执行单个任务（简化了失败逻辑）
   */
  private async _runTask(task: Task<T>): Promise<void> {
    try {
      // 执行用户定义的处理逻辑（该逻辑可能包含其自身的重试）
      await this.processor(task.payload);

      // 任务成功
      task.status = "completed";
      console.log(`[任务成功] ID: ${task.id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[任务失败] ID: ${task.id}, 错误: ${errorMessage}`);

      // 任务失败，直接标记为 failed，不再重试
      task.status = "failed";
      task.error = errorMessage;
    } finally {
      task.processedAt = new Date().toISOString();
      this.activeTasks--;
      this._processQueue(); // 尝试处理下一个任务
    }
  }
}
