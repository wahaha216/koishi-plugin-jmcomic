import { Config } from "..";
import { Logger } from "koishi";
import { randomUUID } from "crypto";
import { JmTaskPayload } from "../processors/jmProcessor";

/**
 * 任务可能的状态
 * pending: 等待处理
 * processing: 正在处理
 * completed: 处理完成
 * failed: 处理失败
 */
type TaskStatus = "pending" | "processing" | "completed" | "failed";

// 任务的数据结构
interface Task {
  id: string;
  payload: JmTaskPayload;
  status: TaskStatus;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

// 处理器函数的类型定义
type TaskProcessor = (payload: JmTaskPayload) => Promise<void>;

// 队列构造函数的选项
interface QueueOptions {
  concurrency?: number;
}

// 任务添加结果，包含任务本身和其排队信息
interface AddTaskResult {
  task: Task;
  pendingAhead: number; // 当前任务前面有多少个待处理任务
  queuePosition: number; // 当前任务在队列中的位置 (1-based index)
}

export class Queue {
  private tasks: Task[] = [];
  private processor: TaskProcessor;
  private readonly concurrency: number;
  private activeTasks: number = 0;
  /**
   * koishi 配置项
   */
  private config: Config;
  /**
   * koishi 日志
   */
  private logger: Logger;

  constructor(
    processor: TaskProcessor,
    options: QueueOptions = {},
    config: Config,
    logger: Logger
  ) {
    this.config = config;
    this.logger = logger;
    this.processor = processor;
    this.concurrency = options.concurrency || 1;
  }

  /**
   * 向队列添加一个新任务
   */
  public add(payload: JmTaskPayload): AddTaskResult {
    const task: Task = {
      id: randomUUID(),
      payload,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.tasks.push(task);
    if (this.config.debug)
      this.logger.info(
        `[任务添加] 任务ID: ${payload} 类型: ${payload.type} ID: ${payload.id}`
      );

    // 计算当前任务的排队信息
    const { pendingAhead, queuePosition } = this.getTaskQueuePosition(task.id);

    // 异步地尝试处理队列
    setTimeout(() => this._processQueue(), 0);

    return { task, pendingAhead, queuePosition };
  }

  /**
   * 获取任务状态
   */
  public getTask(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /**
   * 获取所有任务的只读列表
   */
  public getAllTasks(): Readonly<Task[]> {
    return this.tasks;
  }

  /**
   * 获取指定任务在队列中的位置信息
   * @param taskId 任务ID
   * @returns {pendingAhead: number, queuePosition: number}
   * pendingAhead: 在此任务之前有多少个待处理任务
   * queuePosition: 此任务在所有待处理任务中的位置（从1开始）
   */
  public getTaskQueuePosition(taskId: string): {
    pendingAhead: number;
    queuePosition: number;
  } {
    let pendingAhead = 0;
    let queuePosition = 0; // 默认0，表示未找到或不在待处理队列
    let found = false;

    for (let i = 0; i < this.tasks.length; i++) {
      const currentTask = this.tasks[i];
      if (currentTask.id === taskId) {
        found = true;
        // 如果找到当前任务，且它是待处理或处理中状态，那么它的排位就是前面待处理/处理中的任务数 + 1
        if (currentTask.status === 'pending' || currentTask.status === 'processing') {
          queuePosition = pendingAhead + 1;
        }
        break; // 找到并计算完后即可退出循环
      }
      // 计算待处理和处理中的任务
      if (currentTask.status === 'pending' || currentTask.status === 'processing') {
        pendingAhead++;
      }
    }

    if (!found) {
      // 任务不存在或已处理完毕（不在tasks列表中），可以根据需求返回-1或其他值
      return { pendingAhead: -1, queuePosition: -1 }; // 表示未找到或不适用
    }

    return { pendingAhead, queuePosition };
  }

  /**
   * 检查并处理队列中的任务
   */
  private _processQueue(): void {
    while (this.activeTasks < this.concurrency) {
      const task = this.tasks.find((t) => t.status === "pending");
      if (!task) break; // 没有待处理任务

      this.activeTasks++;
      task.status = "processing";
      if (this.config.debug)
        this.logger.info(
          `[任务开始] 任务ID: ${task.id} 类型: ${task.payload.type} ID: ${task.payload.id}`
        );

      this._runTask(task);
    }
  }

  /**
   * 执行单个任务
   */
  private async _runTask(task: Task): Promise<void> {
    try {
      // 执行定义的处理逻辑
      await this.processor(task.payload);

      // 任务成功
      task.status = "completed";
      if (this.config.debug)
        this.logger.info(
          `[任务成功] 任务ID: ${task.id} 类型: ${task.payload.type} ID: ${task.payload.id}`
        );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (this.config.debug)
        this.logger.error(
          `[任务失败] 任务ID: ${task.id} 类型: ${task.payload.type} ID: ${task.payload.id}, 错误: ${errorMessage}`
        );

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
