# Frontend Conventions

## 1. Giới thiệu

Tài liệu này quy định các convention cho frontend code trong dự án AI Oral Assessment Platform, bao gồm `apps/admin-web` (Next.js) và `apps/desktop` (Electron).

---

## 2. Cấu hình hiện có

### 2.1 ESLint Configuration

Dự án sử dụng ESLint với các config có sẵn:

```javascript
// apps/admin-web/eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "public/audio/**", "next-env.d.ts"]),
]);
```

### 2.2 TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

## 3. TypeScript Conventions

### 3.1 Type Rules

| Rule | Description | Example |
|------|-------------|---------|
| **No `any`** | Sử dụng `unknown` hoặc specific types | `param: unknown` → `param: string` |
| **Explicit types** | Khai báo kiểu rõ ràng cho function parameters và return | `function add(a: number, b: number): number` |
| **Avoid type assertions** | Hạn chế `as` type assertions | Dùng type guards thay thế |
| **Interface vs Type** | Dùng `interface` cho object shapes, `type` cho unions/aliases | `interface User { ... }` |

### 3.2 Type Examples

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
}

type ApiResponse<T> = {
  data: T;
  error: string | null;
};

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ Avoid
function getUser(id: any): any {
  // ...
}
```

---

## 4. Component Conventions

### 4.1 Component Structure

```typescript
// components/UserCard.tsx

// 1. Imports (external → internal)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import type { User } from "@/types";

// 2. Types/Interfaces
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
  isSelected?: boolean;
}

// 3. Component
export function UserCard({ user, onEdit, isSelected }: UserCardProps) {
  // Hooks
  const [isExpanded, setIsExpanded] = useState(false);

  // Derived state
  const displayName = user.name || user.email;

  // Handlers
  const handleEdit = () => {
    onEdit?.(user);
  };

  // Render
  return (
    <div className={`card ${isSelected ? "card--selected" : ""}`}>
      <h3>{displayName}</h3>
      <Button onClick={handleEdit}>Edit</Button>
    </div>
  );
}
```

### 4.2 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Component file | PascalCase | `UserCard.tsx` |
| Component function | PascalCase | `export function UserCard()` |
| Hooks | camelCase, prefix `use` | `useUserData`, `useAuth` |
| Props interface | PascalCase + `Props` suffix | `UserCardProps` |
| Helper functions | camelCase | `formatDate`, `validateEmail` |

### 4.3 File Organization

```
apps/admin-web/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx
│   └── (routes)/
├── components/
│   ├── ui/                 # Shared UI components
│   │   ├── Button.tsx
│   │   └── Modal.tsx
│   ├── features/           # Feature-specific components
│   │   ├── users/
│   │   │   ├── UserList.tsx
│   │   │   └── UserCard.tsx
│   │   └── exams/
│   │       ├── ExamList.tsx
│   │       └── ExamCard.tsx
│   └── shared.tsx          # Shared components
├── lib/
│   ├── api.ts              # API client
│   ├── auth.ts             # Auth utilities
│   └── utils.ts            # Common utilities
├── hooks/                  # Custom hooks
│   └── useAuth.ts
├── types/                  # Shared types
│   └── index.ts
└── public/
```

---

## 5. State Management

### 5.1 Server State (TanStack Query)

```typescript
// ✅ Dùng TanStack Query cho server state
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Query
function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutation
function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserData) => api.post("/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
```

### 5.2 Local State

```typescript
// ✅ Dùng useState cho local state đơn giản
function UserForm() {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
}

// ✅ Dùng useReducer cho complex local state
function ExamSession() {
  const [state, dispatch] = useReducer(examReducer, initialState);

  // ...
}
```

---

## 6. Styling Conventions

### 6.1 CSS Strategy

Dự án sử dụng TailwindCSS cho styling:

```tsx
// ✅ Tailwind classes
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
  <h2 className="text-lg font-semibold">Title</h2>
  <Button className="px-4 py-2">Action</Button>
</div>

// ✅ Conditional classes với clsx hoặc template literals
<div className={clsx(
  "p-4 rounded-lg",
  isActive && "bg-blue-100",
  hasError && "bg-red-100"
)}>
```

### 6.2 CSS Organization

| Location | Purpose |
|----------|---------|
| Tailwind classes | Utility-first styling |
| `globals.css` | Global styles, CSS variables |
| Component-scoped | CSS Modules nếu cần encapsulation |

---

## 7. Error Handling

### 7.1 Error Boundaries

```tsx
// components/ErrorBoundary.tsx
"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 text-red-600">
          Something went wrong: {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 7.2 API Error Handling

```typescript
// lib/api.ts
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { code: "UNKNOWN", message: response.statusText }
    }));
    throw new ApiError(error.error.code, error.error.message);
  }
  return response.json();
}

// Sử dụng trong components
try {
  const users = await api.get<User[]>("/users");
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(error.message);
  }
}
```

---

## 8. Performance

### 8.1 Component Optimization

```tsx
// ✅ Dùng React.memo cho pure components
const UserCard = React.memo(function UserCard({ user }: UserCardProps) {
  return <div>{user.name}</div>;
});

// ✅ Dùng useMemo cho expensive computations
const sortedUsers = useMemo(() => {
  return [...users].sort((a, b) => a.name.localeCompare(b.name));
}, [users]);

// ✅ Dùng useCallback cho callbacks passed as props
const handleEdit = useCallback((userId: string) => {
  // ...
}, [dependencies]);
```

### 8.2 Code Splitting

```tsx
// ✅ Dùng dynamic import cho heavy components
import dynamic from "next/dynamic";

const HeavyChart = dynamic(() => import("@/components/HeavyChart"), {
  loading: () => <Skeleton />,
  ssr: false,
});
```

---

## 9. Accessibility

### 9.1 Basic Rules

| Rule | Implementation |
|------|----------------|
| **Semantic HTML** | Dùng `<button>` cho actions, `<a>` cho links |
| **ARIA labels** | Thêm `aria-label` cho icon-only buttons |
| **Keyboard navigation** | Focus visible styles, tab order |
| **Color contrast** | Đảm bảo contrast ratio ≥ 4.5:1 |

### 9.2 Examples

```tsx
// ✅ Icon button với aria-label
<button
  aria-label="Edit user"
  onClick={handleEdit}
  className="p-2"
>
  <EditIcon />
</button>

// ✅ Form inputs với labels
<label htmlFor="email" className="block text-sm font-medium">
  Email
</label>
<input
  id="email"
  type="email"
  aria-describedby="email-hint"
  className="mt-1 block w-full rounded-md border-gray-300"
/>
<p id="email-hint" className="text-sm text-gray-500">
  We'll never share your email.
</p>
```

---

## 10. Testing

### 10.1 Component Testing

```tsx
// components/__tests__/UserCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { UserCard } from "../UserCard";

describe("UserCard", () => {
  const mockUser = {
    id: "1",
    name: "John Doe",
    email: "john@example.com",
    role: "STUDENT" as const,
  };

  it("renders user name", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("calls onEdit when edit button is clicked", () => {
    const onEdit = vi.fn();
    render(<UserCard user={mockUser} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(mockUser);
  });
});
```

---

## 11. Best Practices Checklist

- [ ] Sử dụng TypeScript strict mode
- [ ] Không dùng `any`
- [ ] Đặt tên component/function/file đúng convention
- [ ] Dùng TanStack Query cho server state
- [ ] Tách logic vào custom hooks khi cần
- [ ] Sử dụng Tailwind classes
- [ ] Xử lý error với Error Boundaries
- [ ] Đảm bảo accessibility
- [ ] Viết tests cho components
