export function FormError({ error }: {
    error?: string;
}) {
    if (!error)
        return null;
    return (<p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger">
      {error}
    </p>);
}
