import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 1: list of past issues, click one to read it.
export function JournalPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Back issues</CardTitle>
        <CardDescription>Your past entries will appear here. (Coming in Phase 1.)</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">No issues printed yet.</CardContent>
    </Card>
  );
}
