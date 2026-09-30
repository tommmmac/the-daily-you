import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 1: chat with the Reporter, then "Go to print".
export function ChatPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Today's interview</CardTitle>
        <CardDescription>The Reporter will be with you shortly. (Coming in Phase 1.)</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Chat about your day here, then hit Go to print.
      </CardContent>
    </Card>
  );
}
