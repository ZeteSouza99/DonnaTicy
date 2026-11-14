
export function LoadingSpinner(): React.JSX.Element {
  return (
    <div role="status" aria-label="Carregando conteúdo" className="w-full space-y-5 py-4">
      <span className="sr-only">Carregando conteúdo…</span>
      <div className="skeleton h-7 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0,1,2,3].map((i) => <div key={i} className="skeleton h-28" />)}</div>
      <div className="panel space-y-4">{[0,1,2,3].map((i) => <div key={i} className="skeleton h-10" />)}</div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 p-6 text-center">
      <p className="text-lg font-medium text-gray-500">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
  );
}

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps): React.JSX.Element {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 p-6 text-center">
      <p role="alert" className="text-base font-semibold text-red-700">Não foi possível concluir</p>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
