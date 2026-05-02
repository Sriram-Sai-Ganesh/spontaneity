import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DeleteChatDialogProps {
  onConfirm: () => void;
  trigger: React.ReactElement;
  mode?: "delete" | "leave";
}

const DeleteChatDialog: React.FC<DeleteChatDialogProps> = ({
  onConfirm,
  trigger,
  mode = "delete",
}) => {
  const isDelete = mode === "delete";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDelete ? "Delete this group?" : "Leave this group?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? "This action cannot be undone. This will permanently delete your group and all its messages."
              : "You will lose access to this group. You can rejoin later with a new invite link."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {isDelete ? "Delete" : "Leave group"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteChatDialog;