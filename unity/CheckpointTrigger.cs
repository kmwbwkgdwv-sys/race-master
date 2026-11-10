// CheckpointTrigger.cs
// コース上のチェックポイント／ショートカットゲート（Is Trigger のコライダー）に付ける。

using UnityEngine;

namespace RaceMaster
{
    [RequireComponent(typeof(Collider))]
    public class CheckpointTrigger : MonoBehaviour
    {
        public enum Kind { Checkpoint, ShortcutGate }

        public Kind kind = Kind.Checkpoint;
        [Tooltip("Checkpoint のとき: 0 = スタート/ゴールライン")]
        public int checkpointIndex;
        [Tooltip("ShortcutGate のとき: StageCatalog のショートカットID")]
        public string shortcutId;
        [Tooltip("救助ドローンがカートを降ろす路面上の位置")]
        public Transform respawnPoint;

        private void OnTriggerEnter(Collider other)
        {
            var tracker = other.GetComponentInParent<LapTracker>();
            if (tracker == null) return;
            if (kind == Kind.Checkpoint) tracker.PassCheckpoint(checkpointIndex);
            else tracker.PassShortcutGate(shortcutId);
        }
    }
}
