import type { Todo } from '../models/schema'

export const TodoItem = ({ todo }: { todo: Todo }) => (
  <li id={`todo-${todo.id}`} class="flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-sm">
    <input
      type="checkbox"
      class="size-4 accent-indigo-600"
      checked={todo.done}
      hx-patch={`/todos/${todo.id}/toggle`}
      hx-target={`#todo-${todo.id}`}
      hx-swap="outerHTML"
    />
    <span class={todo.done ? 'flex-1 line-through text-gray-400' : 'flex-1'}>{todo.title}</span>
    <button
      class="rounded px-2 py-1 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600"
      hx-delete={`/todos/${todo.id}`}
      hx-target={`#todo-${todo.id}`}
      hx-swap="outerHTML"
    >
      x
    </button>
  </li>
)

export const TodoList = ({ todos }: { todos: Todo[] }) => (
  <main class="mx-auto max-w-md space-y-4 p-6">
    <h1 class="text-2xl font-semibold">Todos</h1>
    <form
      class="flex gap-2"
      hx-post="/todos"
      hx-target="#todos"
      hx-swap="beforeend"
      hx-on--after-request="this.reset()"
    >
      <input
        name="title"
        required
        placeholder="New todo"
        class="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">Add</button>
    </form>
    <ul id="todos" class="space-y-2">
      {todos.map((t) => <TodoItem todo={t} />)}
    </ul>
  </main>
)
